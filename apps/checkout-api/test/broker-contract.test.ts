import { describe, expect, it } from 'vitest';
import { parseBrokerRequest } from '../src/broker-contract.js';

describe('fixed checkout broker requests', () => {
  it('maps valid payment input onto the fixed local payments route', () => {
    expect(
      parseBrokerRequest({
        action: 'pay',
        input: {
          orderId: 'order-r1',
          idempotencyKey: 'key-r1',
          amount: 4200,
        },
      }),
    ).toEqual({
      url: 'http://127.0.0.1:4318/payments',
      method: 'POST',
      body: {
        orderId: 'order-r1',
        idempotencyKey: 'key-r1',
        amount: 4200,
      },
    });
  });
  it('maps only the allowed read routes and encodes order IDs as query data', () => {
    expect(parseBrokerRequest({ action: 'charges', orderId: 'order/1?x=y' })).toEqual({
      url: 'http://127.0.0.1:4318/charges?orderId=order%2F1%3Fx%3Dy',
      method: 'GET',
    });
    expect(parseBrokerRequest({ action: 'health' })).toEqual({
      url: 'http://127.0.0.1:4318/health',
      method: 'GET',
    });
  });
  it.each([
    { action: 'health', url: 'http://example.com' },
    { action: 'health', headers: { Authorization: 'secret' } },
    { action: 'health', path: '/admin' },
    { action: 'delete' },
    { action: 'charges', orderId: '' },
    { action: 'charges', orderId: 'x'.repeat(129) },
    { action: 'pay', input: { orderId: 'order', idempotencyKey: 'key', amount: -1 } },
    { action: 'pay', input: { orderId: 'order', idempotencyKey: 'key', amount: 100_000_001 } },
    { action: 'pay', input: { orderId: 'order', idempotencyKey: 'key', amount: 1, url: 'x' } },
  ])('rejects malformed or extra transport controls: %j', (input) => {
    expect(() => parseBrokerRequest(input)).toThrow();
  });
});
