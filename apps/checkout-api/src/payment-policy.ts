import type { PaymentPolicy } from './payment-types.js';

// R1 intentionally uses a new provider idempotency key on each application retry.
// The benchmark replaces only this module with an independently stored variant.
export const paymentPolicy: PaymentPolicy = {
  providerKey: (_input, paymentId) => paymentId,
  reusePriorCharge: false,
  suppressDuplicateError: false,
};
export default paymentPolicy;
