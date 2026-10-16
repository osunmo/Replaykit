import type { PaymentPolicy } from '../../../apps/checkout-api/src/payment-types.js';
export const paymentPolicy: PaymentPolicy = {
  providerKey: (input) => input.idempotencyKey,
  reusePriorCharge: false,
  suppressDuplicateError: false,
};
export default paymentPolicy;
