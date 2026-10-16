import { z } from 'zod';

export const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) =>
      Array.from(value).every((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && code !== 127;
      }),
    'Control characters are not allowed',
  );
export const paymentRequestSchema = z.strictObject({
  orderId: identifierSchema,
  idempotencyKey: identifierSchema,
  amount: z.number().int().positive().max(100_000_000),
});
export type PaymentRequest = z.infer<typeof paymentRequestSchema>;
export interface PaymentPolicy {
  providerKey(input: PaymentRequest, paymentId: string): string;
  reusePriorCharge: boolean;
  suppressDuplicateError: boolean;
}
export interface PaymentResult {
  paymentId: string;
  chargeCount: number;
}
