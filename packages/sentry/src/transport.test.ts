import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
const spies = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: spies.lookup }));
vi.mock('node:https', () => ({ request: spies.request }));
import { requestSentryJson } from './transport.js';

function response(status = 200, body = '{}', headers = {}) {
  spies.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  spies.request.mockImplementation((_options, callback) => {
    const request = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
    request.end.mockImplementation(() =>
      queueMicrotask(() => {
        const stream = Object.assign(Readable.from([Buffer.from(body)]), {
          statusCode: status,
          headers,
        });
        callback(stream);
      }),
    );
    return request;
  });
}
afterEach(() => vi.resetAllMocks());
describe('Authenticated transport boundary (mocked network, not live evidence)', () => {
  it('resolves once, pins validated address and preserves Host and TLS SNI', async () => {
    response();
    expect(
      await requestSentryJson(
        new URL('https://demo.sentry.io/api/0/organizations/demo/issues/1/events/latest/'),
        'canary-secret',
      ),
    ).toEqual({});
    expect(spies.lookup).toHaveBeenCalledTimes(1);
    const options = spies.request.mock.calls[0]![0];
    expect(options.hostname).toBe('demo.sentry.io');
    expect(options.servername).toBe('demo.sentry.io');
    expect(options.headers.Host).toBe('demo.sentry.io');
    const callback = vi.fn();
    options.lookup('demo.sentry.io', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(options.agent).toBe(false);
    expect(options.family).toBe(4);
  });
  it('rejects every mixed DNS answer before any authenticated request', async () => {
    response();
    spies.lookup.mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(
      requestSentryJson(new URL('https://demo.sentry.io/api/0/x/'), 'canary-secret'),
    ).rejects.toMatchObject({ code: 'PRIVATE_ADDRESS' });
    expect(spies.request).not.toHaveBeenCalled();
  });
  it.each([301, 302, 303, 307, 308])(
    'rejects redirect %s without a second request',
    async (status) => {
      response(status, 'canary-secret response', { location: 'https://evil.example/' });
      await expect(
        requestSentryJson(new URL('https://demo.sentry.io/api/0/x/'), 'canary-secret'),
      ).rejects.toMatchObject({ code: 'REDIRECT_REJECTED' });
      expect(spies.request).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [500, 'API_ERROR'],
  ])('maps HTTP %s without leaking body', async (status, code) => {
    response(Number(status), 'Bearer canary-secret');
    try {
      await requestSentryJson(new URL('https://demo.sentry.io/api/0/x/'), 'canary-secret');
      throw Error('unexpected');
    } catch (error) {
      expect(error).toMatchObject({ code });
      expect(String(error)).not.toContain('canary-secret');
    }
  });
  it('blocks an unapproved origin before DNS or auth', async () => {
    await expect(
      requestSentryJson(new URL('https://evil.example/api/0/x/'), 'canary-secret'),
    ).rejects.toMatchObject({ code: 'UNAPPROVED_ORIGIN' });
    expect(spies.lookup).not.toHaveBeenCalled();
    expect(spies.request).not.toHaveBeenCalled();
  });
  it('bounds response bytes and never returns malformed JSON', async () => {
    response(200, 'x'.repeat(200));
    await expect(
      requestSentryJson(new URL('https://demo.sentry.io/api/0/x/'), 'canary-secret', {
        maxResponseBytes: 100,
      }),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    response(200, 'not-json-canary-secret');
    await expect(
      requestSentryJson(new URL('https://demo.sentry.io/api/0/x/'), 'canary-secret'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('bounds a hung DNS lookup', async () => {
    spies.lookup.mockReturnValue(new Promise(() => {}));
    await expect(
      requestSentryJson(new URL('https://demo.sentry.io/api/0/x/'), 'canary-secret', {
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(spies.request).not.toHaveBeenCalled();
  });
});
