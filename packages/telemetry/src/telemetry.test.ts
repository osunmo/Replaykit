import { describe, expect, it } from 'vitest';
import { normalizeIncident, normalizeFrame, redact } from './index.js';

const event = {
  event_id: 'captured-1',
  release: 'sha-1',
  timestamp: '2026-10-16T00:00:00.000Z',
  exception: {
    values: [
      {
        type: 'DuplicatePaymentError',
        value: 'duplicate',
        stacktrace: {
          frames: [
            { function: 'node:internal', in_app: false },
            { function: 'payments/createPayment', in_app: true },
          ],
        },
      },
    ],
  },
  request: {
    data: { orderId: 'order-1', idempotencyKey: 'key-1', amount: 100 },
    headers: { Authorization: 'Bearer secret' },
  },
  breadcrumbs: [
    {
      category: 'payment',
      message: 'provider-charge',
      data: { token: 'secret', clientKey: 'key-1' },
    },
  ],
  spans: [{ traceId: 'abc', spanId: 'def', name: 'payment', attributes: {} }],
};

describe('telemetry boundary', () => {
  it('redacts sensitive nested keys and secret-shaped free text without altering payment evidence', () => {
    const result = redact({
      Authorization: 'Bearer abc',
      nested: {
        password: 'pw',
        email: 'a@b.com',
        card_number: '4111111111111111',
        clientKey: 'key-1',
      },
      message: 'Bearer abc user a@b.com',
    });
    expect(JSON.stringify(result)).not.toContain('abc');
    expect(JSON.stringify(result)).not.toContain('a@b.com');
    expect(result).toMatchObject({ nested: { clientKey: 'key-1', password: '[REDACTED]' } });
  });
  it('removes request, spans and breadcrumbs from minimal inputs', () => {
    const result = normalizeIncident(event, 'minimal');
    expect(result.request).toBeUndefined();
    expect(result.spans).toEqual([]);
    expect(result.breadcrumbs).toEqual([]);
    expect(result.missingEvidence).toEqual(
      expect.arrayContaining(['request.body', 'spans', 'breadcrumbs']),
    );
  });
  it('partial specifically withholds request body while retaining sampled evidence', () => {
    const result = normalizeIncident(event, 'partial');
    expect(result.request).toBeUndefined();
    expect(result.spans).toHaveLength(1);
    expect(result.missingEvidence).toContain('request.body');
  });
  it('extracts actual application frame and rejects an absent exception', () => {
    expect(normalizeIncident(event, 'full').exception.topApplicationFrame).toBe(
      'payments/createPayment',
    );
    expect(() => normalizeIncident({}, 'full')).toThrow();
  });
  it('normalizes build paths without conflating different functions', () => {
    expect(normalizeFrame('async payments.createPayment')).toBe('payments/createPayment');
    expect(normalizeFrame('payments/refundPayment')).not.toBe('payments/createPayment');
  });
});
