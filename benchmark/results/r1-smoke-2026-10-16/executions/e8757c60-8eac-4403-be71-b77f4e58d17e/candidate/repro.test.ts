import { payment } from '/sdk/replay-fixture.mjs';
const request = {"orderId":"order-synthetic-1","idempotencyKey":"checkout-key-1","amount":1250};
await payment(request);
await payment(request);
