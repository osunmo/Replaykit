import { afterEach, describe, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => vi.fn());
vi.mock('./transport.js', () => ({ requestSentryJson: transport }));
import { importSentryIssue, SentryImportError } from './index.js';

const revisions = [
  {
    release: 'opaque-unit-release',
    service: 'checkout-api' as const,
    revision: `sha256:${'a'.repeat(64)}`,
    applicationSourceHash: 'b'.repeat(64),
  },
];
function event() {
  return {
    eventID: 'a'.repeat(32),
    groupID: '1',
    release: 'opaque-unit-release',
    dateCreated: '2026-10-17T12:00:00.000Z',
    contexts: { trace: { trace_id: 'b'.repeat(32) } },
    entries: [
      {
        type: 'exception',
        data: {
          values: [
            {
              type: 'DuplicatePaymentError',
              value: 'unit event',
              stacktrace: {
                frames: [{ filename: '/dist/payments.js', function: 'createPayment', inApp: true }],
              },
            },
          ],
        },
      },
    ],
  };
}
const options = { token: 'canary-token-unique-123', supportedRevisions: revisions };
afterEach(() => vi.resetAllMocks());
describe('Sentry import orchestration (mocked API, never live completion evidence)', () => {
  it.each([
    'https://sentry.io.evil.example/organizations/demo/issues/1/',
    'https://sentry.io@evil.example/organizations/demo/issues/1/',
    'https://127.0.0.1/organizations/demo/issues/1/',
    'https://demo.sentry.io/issues/not-a-number/',
    'https://demo.sentry.io/issues/1/events/not-an-event/',
    'http://demo.sentry.io/issues/1/',
  ])('rejects %s before any authenticated request', async (url) => {
    await expect(importSentryIssue(url, options)).rejects.toBeInstanceOf(SentryImportError);
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects missing token without a request', async () => {
    await expect(
      importSentryIssue('https://demo.sentry.io/issues/1/', { supportedRevisions: revisions }),
    ).rejects.toMatchObject({ code: 'MISSING_TOKEN' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('uses documented API paths, latest selector, concrete selected ID and optional trace', async () => {
    transport
      .mockResolvedValueOnce(event())
      .mockResolvedValueOnce([{ span_id: 'c'.repeat(16), op: 'payment' }]);
    const result = await importSentryIssue(
      'https://demo.sentry.io/issues/1/?query=secret-dont-forward',
      options,
    );
    expect(transport.mock.calls[0]![0].toString()).toBe(
      'https://demo.sentry.io/api/0/organizations/demo/issues/1/events/latest/',
    );
    expect(transport.mock.calls[1]![0].pathname).toBe(
      `/api/0/organizations/demo/trace/${'b'.repeat(32)}/`,
    );
    expect(result.provenance.eventId).toBe('a'.repeat(32));
    expect(result.provenance.trace.status).toBe('AVAILABLE');
    expect(JSON.stringify(result)).not.toContain(options.token);
  });
  it('requests an explicitly supplied event', async () => {
    transport.mockResolvedValueOnce(event()).mockResolvedValueOnce([]);
    await importSentryIssue(
      `https://sentry.io/organizations/demo/issues/1/events/${'a'.repeat(32)}/`,
      options,
    );
    expect(transport.mock.calls[0]![0].pathname).toBe(
      `/api/0/organizations/demo/issues/1/events/${'a'.repeat(32)}/`,
    );
  });
  it.each([
    ['FORBIDDEN', 'TRACE_SCOPE_MISSING'],
    ['NOT_FOUND', 'TRACE_NOT_FOUND'],
    ['REQUEST_TIMEOUT', 'TRACE_UNAVAILABLE'],
  ])('optional trace %s does not discard valid event', async (code, reason) => {
    transport
      .mockResolvedValueOnce(event())
      .mockRejectedValueOnce(new SentryImportError(code as 'FORBIDDEN'));
    const result = await importSentryIssue('https://demo.sentry.io/issues/1/', options);
    expect(result.provenance.trace.status).toBe(reason);
    expect(result.incident.missingEvidence).toContain(`trace.${reason}`);
  });
  it('does not fetch trace for an unsupported release', async () => {
    transport.mockResolvedValueOnce({ ...event(), release: 'unknown' });
    await expect(
      importSentryIssue('https://demo.sentry.io/issues/1/', options),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_REVISION' });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not expose unexpected transport error text', async () => {
    transport.mockRejectedValue(new Error('network failed for canary-token-unique-123'));
    await expect(importSentryIssue('https://demo.sentry.io/issues/1/', options)).rejects.toThrow(
      'NETWORK_ERROR',
    );
  });
});
