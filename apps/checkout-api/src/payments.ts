import { SpanStatusCode, trace } from '@opentelemetry/api';
import type { Pool, PoolClient } from 'pg';
import { nextPaymentId } from './database.js';
import type { PaymentPolicy, PaymentRequest, PaymentResult } from './payment-types.js';

interface Charge {
  id: string;
  order_id: string;
  client_key: string;
  provider_key: string;
  amount: number;
}
export interface PaymentAttempt {
  order_id: string;
  client_key: string;
  provider_key: string;
  amount: number;
}
export class DuplicatePaymentError extends Error {
  override name = 'DuplicatePaymentError';
  constructor(
    readonly chargeCount: number,
    readonly observedAttempts: PaymentAttempt[],
  ) {
    super('Repeated idempotency key produced more than one provider charge');
  }
}
export class IdempotencyConflictError extends Error {
  override name = 'IdempotencyConflictError';
  constructor() {
    super('Idempotency key was already used with a different payment payload');
  }
}

export async function chargeCount(pool: Pool | PoolClient, orderId: string): Promise<number> {
  const result = await pool.query<{ count: number }>(
    'SELECT COUNT(*)::integer AS count FROM public.charges WHERE order_id = $1',
    [orderId],
  );
  return result.rows[0]!.count;
}

async function providerCharge(
  client: PoolClient,
  input: PaymentRequest,
  paymentId: string,
  providerKey: string,
): Promise<Charge> {
  return trace.getTracer('checkout-api').startActiveSpan('provider/charge', async (span) => {
    span.setAttributes({
      'payment.client_key': input.idempotencyKey,
      'payment.provider_key': providerKey,
      'payment.order_id': input.orderId,
      'payment.amount': input.amount,
    });
    try {
      const inserted = await client.query<Charge>(
        `INSERT INTO public.charges
        (id, order_id, client_key, provider_key, amount) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (provider_key) DO NOTHING RETURNING *`,
        [paymentId, input.orderId, input.idempotencyKey, providerKey, input.amount],
      );
      const charge =
        inserted.rows[0] ??
        (
          await client.query<Charge>('SELECT * FROM public.charges WHERE provider_key = $1', [
            providerKey,
          ])
        ).rows[0];
      if (!charge) throw new Error('Provider returned no charge');
      if (
        charge.order_id !== input.orderId ||
        charge.amount !== input.amount ||
        charge.client_key !== input.idempotencyKey
      )
        throw new IdempotencyConflictError();
      span.setAttribute('payment.inserted', inserted.rowCount === 1);
      return charge;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      if (error instanceof Error) span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

async function instrumentedPayment(
  pool: Pool,
  input: PaymentRequest,
  policy: PaymentPolicy,
): Promise<PaymentResult> {
  return trace
    .getTracer('checkout-api')
    .startActiveSpan('payments/createPayment', async function createPayment(span) {
      span.setAttributes({
        'payment.client_key': input.idempotencyKey,
        'payment.order_id': input.orderId,
        'payment.amount': input.amount,
      });
      let client: PoolClient | undefined;
      let committed = false;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout = '5s'");
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          input.idempotencyKey,
        ]);
        const previous = await client.query<PaymentAttempt>(
          'SELECT order_id, client_key, amount, provider_key FROM public.payment_attempts WHERE client_key = $1 ORDER BY id LIMIT 1',
          [input.idempotencyKey],
        );
        const prior = previous.rows[0];
        if (prior && (prior.order_id !== input.orderId || prior.amount !== input.amount)) {
          throw new IdempotencyConflictError();
        }
        const paymentId = nextPaymentId();
        const cached = policy.reusePriorCharge
          ? (
              await client.query<Charge>(
                'SELECT * FROM public.charges WHERE client_key = $1 ORDER BY id LIMIT 1',
                [input.idempotencyKey],
              )
            ).rows[0]
          : undefined;
        const providerKey = cached?.provider_key ?? policy.providerKey(input, paymentId);
        const charge = cached ?? (await providerCharge(client, input, paymentId, providerKey));
        span.setAttribute('payment.cached', cached !== undefined);
        await client.query(
          `INSERT INTO public.payment_attempts
        (id, order_id, client_key, amount, provider_key) VALUES ($1, $2, $3, $4, $5)`,
          [paymentId, input.orderId, input.idempotencyKey, input.amount, providerKey],
        );
        const count = await chargeCount(client, input.orderId);
        const duplicate = await client.query<{ count: number }>(
          'SELECT COUNT(*)::integer AS count FROM public.charges WHERE client_key = $1',
          [input.idempotencyKey],
        );
        const attempts = await client.query<PaymentAttempt>(
          `SELECT order_id, client_key, amount, provider_key
        FROM public.payment_attempts WHERE client_key = $1 ORDER BY id LIMIT 100`,
          [input.idempotencyKey],
        );
        // The provider ledger is durable before application-level duplicate detection.
        await client.query('COMMIT');
        committed = true;
        if (duplicate.rows[0]!.count > 1 && !policy.suppressDuplicateError) {
          throw new DuplicatePaymentError(count, attempts.rows);
        }
        return { paymentId: charge.id, chargeCount: count };
      } catch (error) {
        if (client && !committed) await client.query('ROLLBACK');
        span.setStatus({ code: SpanStatusCode.ERROR });
        if (error instanceof Error) span.recordException(error);
        throw error;
      } finally {
        client?.release();
        span.end();
      }
    });
}

export { instrumentedPayment as createPayment };
