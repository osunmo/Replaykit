import Fastify from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { identifierSchema, paymentRequestSchema, type PaymentPolicy } from './payment-types.js';
import { paymentPolicy } from './payment-policy.js';
import {
  chargeCount,
  createPayment,
  DuplicatePaymentError,
  IdempotencyConflictError,
} from './payments.js';
import { flushSpans, spansForKey } from './instrumentation.js';
import { applicationFrames } from './stack-frames.js';

let eventSequence = 0;
const chargesQuery = z.strictObject({ orderId: identifierSchema });
export function buildApp(options: {
  pool: Pool;
  policy?: PaymentPolicy;
  writeIncident?: (line: string) => void;
}) {
  const app = Fastify({ logger: false, bodyLimit: 2048, requestTimeout: 10000 });
  const policy = options.policy ?? paymentPolicy;
  const writeIncident =
    options.writeIncident ?? ((line: string) => process.stdout.write(`${line}\n`));

  app.get('/health', async () => ({ ok: true }));
  app.get('/charges', async (request, reply) => {
    const parsed = chargesQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'InvalidRequest' });
    return { chargeCount: await chargeCount(options.pool, parsed.data.orderId) };
  });
  app.post('/payments', async (request, reply) => {
    const parsed = paymentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'InvalidRequest' });
    try {
      return await createPayment(options.pool, parsed.data, policy);
    } catch (error) {
      if (error instanceof DuplicatePaymentError) {
        await flushSpans();
        eventSequence += 1;
        writeIncident(
          JSON.stringify({
            kind: 'incident',
            event: {
              event_id: `checkout-${String(eventSequence).padStart(8, '0')}`,
              release: process.env.REPLAYKIT_RELEASE ?? 'checkout-r1-local',
              timestamp: new Date().toISOString(),
              exception: {
                values: [
                  {
                    type: error.name,
                    value: error.message,
                    stacktrace: { frames: applicationFrames(error) },
                  },
                ],
              },
              request: { data: parsed.data },
              breadcrumbs: error.observedAttempts.map((attempt) => ({
                category: 'payment',
                message: 'provider-charge',
                data: {
                  clientKey: attempt.client_key,
                  providerKey: attempt.provider_key,
                  orderId: attempt.order_id,
                  amount: attempt.amount,
                },
              })),
              spans: spansForKey(parsed.data.idempotencyKey),
            },
          }),
        );
        return reply.code(409).send({ error: error.name, chargeCount: error.chargeCount });
      }
      if (error instanceof IdempotencyConflictError) {
        return reply.code(409).send({
          error: error.name,
          chargeCount: await chargeCount(options.pool, parsed.data.orderId),
        });
      }
      throw error;
    } finally {
      await flushSpans();
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply.code(error.statusCode).send({ error: 'InvalidRequest' });
    }
    return reply.code(500).send({ error: 'InternalServerError' });
  });
  return app;
}
