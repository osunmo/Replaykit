import { isIP } from 'node:net';
import { SentryImportError } from './errors.js';

export interface SentryIssueLocation {
  origin: string;
  organization: string;
  issueId: string;
  eventId?: string;
}
const slug = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
export const eventIdPattern = /^[a-fA-F0-9]{32}$/;

function strictUrl(input: string, config = false): URL {
  const code = config ? 'INVALID_SELF_HOSTED_BASE' : 'INVALID_SENTRY_URL';
  if (typeof input !== 'string' || input.length > 4096 || /[\s\\%]/.test(input.split('?')[0]!))
    throw new SentryImportError(code);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new SentryImportError(code);
  }
  const authority = /^https:\/\/([^/]+)(?:\/|$)/.exec(input)?.[1];
  if (
    !authority ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    url.hostname.endsWith('.') ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/.test(input) ||
    !/^[a-z0-9.-]+$/i.test(url.hostname)
  )
    throw new SentryImportError(code);
  // An explicit :443 is harmless, but every other port is rejected by URL.port.
  return url;
}
export function approvedOrigin(url: URL, selfHostedBaseUrl?: string): boolean {
  let selfHosted: string | undefined;
  if (selfHostedBaseUrl !== undefined) {
    const configured = strictUrl(selfHostedBaseUrl, true);
    if (configured.pathname !== '/' || configured.search)
      throw new SentryImportError('INVALID_SELF_HOSTED_BASE');
    selfHosted = configured.origin;
  }
  return (
    url.origin === selfHosted || url.hostname === 'sentry.io' || url.hostname.endsWith('.sentry.io')
  );
}
export function parseSentryIssueUrl(
  input: string,
  selfHostedBaseUrl?: string,
): SentryIssueLocation {
  const url = strictUrl(input);
  if (!approvedOrigin(url, selfHostedBaseUrl)) throw new SentryImportError('UNAPPROVED_ORIGIN');
  const path = url.pathname.split('/').filter(Boolean);
  let organization: string | undefined;
  let rest: string[];
  if (path[0] === 'organizations') {
    organization = path[1];
    rest = path.slice(2);
  } else {
    const host = /^([a-zA-Z0-9_-]+)\.sentry\.io$/.exec(url.hostname);
    organization = host?.[1];
    rest = path;
  }
  if (!organization || !slug.test(organization) || rest[0] !== 'issues')
    throw new SentryImportError('INVALID_SENTRY_URL');
  const issueId = rest[1];
  if (!issueId || !/^\d{1,32}$/.test(issueId)) throw new SentryImportError('INVALID_ISSUE_ID');
  if (rest.length !== 2 && (rest.length !== 4 || rest[2] !== 'events'))
    throw new SentryImportError('INVALID_SENTRY_URL');
  const eventId = rest[3];
  if (eventId !== undefined && !eventIdPattern.test(eventId))
    throw new SentryImportError('INVALID_EVENT_ID');
  return {
    origin: url.origin,
    organization,
    issueId,
    ...(eventId ? { eventId: eventId.toLowerCase() } : {}),
  };
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number) as [number, number, number, number];
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family !== 6 || address.includes('.') || address.includes('%')) return false;
  const [left, right] = address.toLowerCase().split('::');
  const before = left ? left.split(':') : [];
  const after = right ? right.split(':') : [];
  const parts =
    right !== undefined
      ? [...before, ...Array<string>(8 - before.length - after.length).fill('0'), ...after]
      : before;
  const words = parts.map((part) => parseInt(part, 16));
  const first = words[0]!,
    second = words[1]!;
  // Accept native globally routable unicast only. Reject transition/mapped, special-use,
  // documentation, multicast, local, link-local and unallocated ranges conservatively.
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    !(first === 0x2001 && (second < 0x0200 || second === 0x0db8)) &&
    first !== 0x2002 &&
    !(first === 0x3fff && second < 0x1000)
  );
}
