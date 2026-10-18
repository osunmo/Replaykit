import { describe, expect, it } from 'vitest';
import { isPublicAddress, parseSentryIssueUrl } from './security.js';

describe('Sentry URL and address boundary (unit fixtures, not live evidence)', () => {
  it.each([
    ['https://demo.sentry.io/issues/123/', 'demo', '123', undefined],
    ['https://sentry.io/organizations/demo/issues/123/?project=1', 'demo', '123', undefined],
    [
      'https://demo.sentry.io/issues/123/events/0123456789abcdef0123456789abcdef/?query=x',
      'demo',
      '123',
      '0123456789abcdef0123456789abcdef',
    ],
  ])('parses %s without forwarding query data', (url, organization, issueId, eventId) => {
    expect(parseSentryIssueUrl(url!)).toEqual({
      origin: new URL(url!).origin,
      organization,
      issueId,
      ...(eventId ? { eventId } : {}),
    });
  });
  it.each([
    'http://demo.sentry.io/issues/1/',
    'https://sentry.io.evil.example/issues/1/',
    'https://evilsentry.io/issues/1/',
    'https://sentry.io@evil.example/issues/1/',
    'https://user:password@demo.sentry.io/issues/1/',
    'https://127.0.0.1/issues/1/',
    'https://[::1]/issues/1/',
    'https://2130706433/issues/1/',
    'https://demo.sentry.io:444/issues/1/',
    'https://demo.sentry.io./issues/1/',
    'https://demo.sentry.io/issues/nope/',
    'https://demo.sentry.io/issues/1/events/nope/',
    'https://demo.sentry.io/issues/%31/',
    'https://demo.sentry.io/a/../issues/1/',
    'https://demo.sentry.io\\@evil.example/issues/1/',
    'https://demo.sentry.io/issues/1/#x',
  ])('rejects ambiguous or unauthorized URL %s', (url) => {
    expect(() => parseSentryIssueUrl(url)).toThrow();
  });
  it('supports precisely one configured self-host origin', () => {
    const base = 'https://errors.example.com';
    expect(parseSentryIssueUrl(`${base}/organizations/demo/issues/1/`, base).origin).toBe(base);
    expect(() =>
      parseSentryIssueUrl('https://other.example.com/organizations/demo/issues/1/', base),
    ).toThrow();
    expect(() =>
      parseSentryIssueUrl(`${base}/organizations/demo/issues/1/`, `${base}/api`),
    ).toThrow();
  });
  it.each([
    '0.1.2.3',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.0.1',
    '192.0.2.1',
    '198.18.1.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:8.8.8.8',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2001::1',
    '2002:7f00:1::',
    '3fff::1',
  ])('blocks non-public or transition address %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
  it.each(['8.8.8.8', '1.1.1.1', '34.120.195.249', '2001:4860:4860::8888', '2606:4700:4700::1111'])(
    'permits public address %s',
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});
