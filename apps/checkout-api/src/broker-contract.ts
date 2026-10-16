import { z } from 'zod';
import { identifierSchema, paymentRequestSchema, type PaymentRequest } from './payment-types.js';

const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('pay'), input: paymentRequestSchema }),
  z.strictObject({ action: z.literal('charges'), orderId: identifierSchema }),
  z.strictObject({ action: z.literal('health') }),
]);
export interface BrokerRequest {
  url: string;
  method: 'GET' | 'POST';
  body?: PaymentRequest;
}
export function parseBrokerRequest(input: unknown): BrokerRequest {
  const command = commandSchema.parse(input);
  switch (command.action) {
    case 'pay':
      return { url: 'http://127.0.0.1:4318/payments', method: 'POST', body: command.input };
    case 'charges':
      return {
        url: `http://127.0.0.1:4318/charges?orderId=${encodeURIComponent(command.orderId)}`,
        method: 'GET',
      };
    case 'health':
      return { url: 'http://127.0.0.1:4318/health', method: 'GET' };
  }
}
