import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payment, chargeCount } from '/sdk/replay-fixture.mjs';

test('repeated payment keeps one charge per idempotency key', async () => {
  const request = {"orderId":"order-synthetic-1","idempotencyKey":"checkout-key-1","amount":1250};
  await payment(request);
  await payment(request);
  assert.equal(await chargeCount(request.orderId), 1);
});
