import { z } from 'zod';
import { PaymentRequestSchema, type PaymentRequest } from '../../contracts/src/index.js';
const id = z.number().int().min(1).max(20);
const BrokerRequestSchema = z.discriminatedUnion('action', [
  z.strictObject({ id, action: z.literal('pay'), input: PaymentRequestSchema }),
  z.strictObject({ id, action: z.literal('charges'), orderId: z.string().min(1).max(128) }),
]);
export function validateBrokerRequest(input: unknown, request: PaymentRequest) {
  const validated = BrokerRequestSchema.safeParse(input);
  if (!validated.success) throw new Error('CANDIDATE_PROTOCOL_REJECTED');
  const parsed = validated.data;
  if (
    parsed.action === 'pay' &&
    (parsed.input.orderId !== request.orderId ||
      parsed.input.idempotencyKey !== request.idempotencyKey ||
      parsed.input.amount !== request.amount)
  )
    throw new Error('Broker permits only the evidence-backed payment request');
  if (parsed.action === 'charges' && parsed.orderId !== request.orderId)
    throw new Error('Broker permits only the evidence-backed order');
  return parsed;
}
const IsolationSchema = z.object({
  Config: z.object({ User: z.literal('1000:1000') }),
  HostConfig: z.object({
    NetworkMode: z.literal('none'),
    ReadonlyRootfs: z.literal(true),
    CapDrop: z.array(z.string()),
    SecurityOpt: z.array(z.string()),
    PidsLimit: z.number().positive().max(128),
    Memory: z.number().positive().max(268435456),
    NanoCpus: z.number().positive().max(1000000000),
  }),
  Mounts: z
    .array(
      z.object({
        Destination: z.literal('/candidate'),
        RW: z.literal(false),
        Type: z.literal('bind'),
      }),
    )
    .length(1),
});
export function checkIsolation(input: unknown): boolean {
  const parsed = IsolationSchema.safeParse(input);
  return (
    parsed.success &&
    parsed.data.HostConfig.CapDrop.includes('ALL') &&
    parsed.data.HostConfig.SecurityOpt.some((option) => option.startsWith('no-new-privileges'))
  );
}
