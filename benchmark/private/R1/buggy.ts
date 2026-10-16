import type { PaymentPolicy } from '../../../apps/checkout-api/src/payment-types.js';
export const paymentPolicy: PaymentPolicy = {
  providerKey: (_input, paymentId) => paymentId,
  reusePriorCharge: false,
  suppressDuplicateError: false,
};
export default paymentPolicy;
