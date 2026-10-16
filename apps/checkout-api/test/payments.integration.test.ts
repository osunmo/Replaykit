import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { initDatabase } from '../src/database.js';
import { startTelemetry, stopTelemetry } from '../src/instrumentation.js';
import { paymentPolicy as buggy } from '../../../benchmark/private/R1/buggy.js';
import { paymentPolicy as reference } from '../../../benchmark/private/R1/reference.js';
import { paymentPolicy as alternate } from '../../../benchmark/private/R1/alternate.js';
import { paymentPolicy as decoy } from '../../../benchmark/private/R1/decoy.js';
import type { PaymentPolicy } from '../src/payment-types.js';
import { createPayment, DuplicatePaymentError } from '../src/payments.js';
import { applicationFrames } from '../src/stack-frames.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required; run pnpm test:integration');
const target = new URL(connectionString);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) ||
  target.pathname !== '/replaykit' ||
  target.username !== 'replaykit'
) {
  throw new Error('Integration reset is restricted to the local replaykit database.');
}
const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
const input = { orderId: 'order-r1', idempotencyKey: 'checkout-r1', amount: 4200 };
let app: FastifyInstance | undefined;
let lines: string[] = [];

async function open(policy: PaymentPolicy) {
  app = buildApp({ pool, policy, writeIncident: (line) => lines.push(line) });
  await app.ready();
  return app;
}
async function reset() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE public.payment_attempts, public.charges');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  startTelemetry();
  await initDatabase(pool);
});
beforeEach(async () => {
  lines = [];
  await reset();
});
afterEach(async () => {
  await app?.close();
  app = undefined;
});
afterAll(async () => {
  await pool.end();
  await stopTelemetry();
});

describe('PostgreSQL checkout policy matrix', () => {
  it('normalizes the application frame from the error actually thrown by the payment operation', async () => {
    await createPayment(pool, input, buggy);
    try {
      await createPayment(pool, input, buggy);
      expect.unreachable('A second durable charge must raise the duplicate error');
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicatePaymentError);
      expect((error as Error).stack).toMatch(/at createPayment .*payments\.(?:ts|js):/);
      expect(applicationFrames(error as Error)).toEqual([
        { function: 'payments/createPayment', in_app: true },
      ]);
    }
  });
  it('buggy retry creates two durable charges and reports the actual duplicate', async () => {
    const service = await open(buggy);
    const first = await service.inject({ method: 'POST', url: '/payments', payload: input });
    const retry = await service.inject({ method: 'POST', url: '/payments', payload: input });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ chargeCount: 1 });
    expect(retry.statusCode).toBe(409);
    expect(retry.json()).toMatchObject({ error: 'DuplicatePaymentError', chargeCount: 2 });
    const charges = await pool.query('SELECT * FROM public.charges ORDER BY id');
    expect(charges.rows).toHaveLength(2);
    expect(charges.rows[0].provider_key).not.toBe(charges.rows[1].provider_key);
    expect((await service.inject(`/charges?orderId=${input.orderId}`)).json()).toEqual({
      chargeCount: 2,
    });
    expect(lines).toHaveLength(1);
    const incident = JSON.parse(lines[0]!);
    expect(incident).toMatchObject({
      kind: 'incident',
      event: {
        request: { data: input },
        exception: {
          values: [
            {
              type: 'DuplicatePaymentError',
              stacktrace: { frames: [{ function: 'payments/createPayment', in_app: true }] },
            },
          ],
        },
      },
    });
    expect(
      incident.event.breadcrumbs.map((b: { data: { providerKey: string } }) => b.data.providerKey),
    ).toEqual(charges.rows.map((row) => row.provider_key));
    expect(incident.event.spans.length).toBeGreaterThan(0);
    expect(
      incident.event.spans.some(
        (span: { name: string; traceId: string }) =>
          span.name === 'payments/createPayment' &&
          /^[a-f0-9]{32}$/.test(span.traceId) &&
          !/^0+$/.test(span.traceId),
      ),
    ).toBe(true);
  });

  it.each([
    ['reference', reference],
    ['alternate', alternate],
  ] as const)('%s fix returns one original payment for retries', async (_name, policy) => {
    const service = await open(policy);
    const first = await service.inject({ method: 'POST', url: '/payments', payload: input });
    const retry = await service.inject({ method: 'POST', url: '/payments', payload: input });
    expect(first.statusCode).toBe(200);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(retry.json()).toMatchObject({ chargeCount: 1 });
    expect((await pool.query('SELECT * FROM public.charges')).rows).toHaveLength(1);
    expect((await pool.query('SELECT * FROM public.payment_attempts')).rows).toHaveLength(2);
    expect(lines).toHaveLength(0);
  });

  it.each([
    ['reference', reference],
    ['alternate', alternate],
  ] as const)(
    '%s fix retains the invariant check when duplicate ledger rows already exist',
    async (_name, policy) => {
      await pool.query(
        `INSERT INTO public.charges (id, order_id, client_key, provider_key, amount)
       VALUES ($1, $3, $4, $4, $5), ($2, $3, $4, $6, $5)`,
        [
          'seed-charge-1',
          'seed-charge-2',
          input.orderId,
          input.idempotencyKey,
          input.amount,
          'seed-other-provider-key',
        ],
      );
      await expect(createPayment(pool, input, policy)).rejects.toMatchObject({
        name: 'DuplicatePaymentError',
        chargeCount: 2,
      });
      expect((await pool.query('SELECT * FROM public.charges')).rows).toHaveLength(2);
      expect((await pool.query('SELECT * FROM public.payment_attempts')).rows).toHaveLength(1);
    },
  );

  it('decoy hides the domain error while leaving two real charges', async () => {
    const service = await open(decoy);
    await service.inject({ method: 'POST', url: '/payments', payload: input });
    const retry = await service.inject({ method: 'POST', url: '/payments', payload: input });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toMatchObject({ chargeCount: 2 });
    expect((await pool.query('SELECT * FROM public.charges')).rows).toHaveLength(2);
    expect(lines).toHaveLength(0);
  });

  it.each([
    ['reference', reference],
    ['alternate', alternate],
  ] as const)('%s fix handles overlapping identical requests atomically', async (_name, policy) => {
    const service = await open(policy);
    const replies = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.inject({ method: 'POST', url: '/payments', payload: input }),
      ),
    );
    expect(replies.map((reply) => reply.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(replies.map((reply) => reply.json().paymentId)).size).toBe(1);
    expect((await pool.query('SELECT * FROM public.charges')).rows).toHaveLength(1);
  });

  it.each([
    ['buggy', buggy],
    ['reference', reference],
    ['alternate', alternate],
    ['decoy', decoy],
  ] as const)(
    '%s rejects changed payloads for an existing key before charging',
    async (_name, policy) => {
      const service = await open(policy);
      await service.inject({ method: 'POST', url: '/payments', payload: input });
      for (const changed of [
        { ...input, amount: 4300 },
        { ...input, orderId: 'order-other' },
      ]) {
        const reply = await service.inject({ method: 'POST', url: '/payments', payload: changed });
        expect(reply.statusCode).toBe(409);
        expect(reply.json().error).toBe('IdempotencyConflictError');
      }
      expect((await pool.query('SELECT * FROM public.charges')).rows).toHaveLength(1);
      const independent = await service.inject({
        method: 'POST',
        url: '/payments',
        payload: { ...input, orderId: 'order-other', idempotencyKey: 'checkout-other' },
      });
      expect(independent.statusCode).toBe(200);
      expect(independent.json().chargeCount).toBe(1);
    },
  );

  it('rejects malformed, overlong and unknown fields without changing the ledger', async () => {
    const service = await open(buggy);
    for (const payload of [
      { ...input, amount: 0 },
      { ...input, amount: 1.1 },
      { ...input, amount: 100_000_001 },
      { ...input, amount: '4200' },
      { ...input, orderId: '' },
      { ...input, idempotencyKey: 'x'.repeat(129) },
      { ...input, secret: 'do-not-log' },
    ]) {
      expect((await service.inject({ method: 'POST', url: '/payments', payload })).statusCode).toBe(
        400,
      );
    }
    expect((await service.inject('/charges?orderId=order-r1&extra=ignored')).statusCode).toBe(400);
    expect((await service.inject('/health')).json()).toEqual({ ok: true });
    expect((await pool.query('SELECT * FROM public.charges')).rows).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });
});
