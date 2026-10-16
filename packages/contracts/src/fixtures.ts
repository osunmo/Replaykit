// Synthetic inputs for unit tests; this is not measured incident evidence.
export function incidentFixture() {
  return {
    schemaVersion: 1 as const,
    id: 'arbitrary-incident',
    service: 'checkout-api',
    revision: 'fixture-revision',
    timestamp: '2026-10-16T00:00:00.000Z',
    telemetryTier: 'full' as const,
    exception: {
      type: 'DuplicatePaymentError',
      message: 'Two charges for one key',
      topApplicationFrame: 'payments/createPayment',
    },
    request: { orderId: 'order-1', idempotencyKey: 'key-1', amount: 1250 },
    breadcrumbs: [
      {
        category: 'payment',
        message: 'provider-charge',
        data: { clientKey: 'key-1', providerKey: 'pay-1', orderId: 'order-1', amount: 1250 },
      },
      {
        category: 'payment',
        message: 'provider-charge',
        data: { clientKey: 'key-1', providerKey: 'pay-2', orderId: 'order-1', amount: 1250 },
      },
    ],
    spans: [],
    missingEvidence: [],
    metadata: {},
  };
}
