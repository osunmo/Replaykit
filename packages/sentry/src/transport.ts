import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import type { LookupFunction } from 'node:net';
import { SentryImportError } from './errors.js';
import { approvedOrigin, isPublicAddress } from './security.js';

export interface TransportOptions {
  selfHostedBaseUrl?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}
export async function requestSentryJson(
  url: URL,
  token: string,
  options: TransportOptions = {},
): Promise<unknown> {
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !approvedOrigin(url, options.selfHostedBaseUrl)
  )
    throw new SentryImportError('UNAPPROVED_ORIGIN');
  if (!token) throw new SentryImportError('MISSING_TOKEN');
  // eslint-disable-next-line no-control-regex
  if (token.length > 4096 || /[\s\x00-\x1f\x7f]/.test(token))
    throw new SentryImportError('INVALID_TOKEN');
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 15_000, 1), 30_000);
  const maxBytes = Math.min(Math.max(options.maxResponseBytes ?? 2_097_152, 1), 4_194_304);
  const deadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }).catch(() => {
      throw new SentryImportError('DNS_FAILED');
    }),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new SentryImportError('REQUEST_TIMEOUT')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  if (
    !addresses.length ||
    addresses.some((entry) => !isPublicAddress(entry.address) || ![4, 6].includes(entry.family))
  )
    throw new SentryImportError('PRIVATE_ADDRESS');
  const pinned = addresses[0]!;
  // The connection sees only this previously validated address. DNS is never resolved again.
  const pinnedLookup: LookupFunction = (_hostname, _lookupOptions, callback) =>
    callback(null, pinned.address, pinned.family);
  return new Promise((resolve, reject) => {
    let complete = false;
    let timeout: ReturnType<typeof setTimeout> | undefined = undefined;
    const finish = (error?: SentryImportError, value?: unknown) => {
      if (complete) return;
      complete = true;
      if (timeout) clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
    const req = request(
      {
        protocol: 'https:',
        hostname: url.hostname,
        port: 443,
        servername: url.hostname,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        headers: {
          Host: url.hostname,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Accept-Encoding': 'identity',
        },
        lookup: pinnedLookup,
        family: pinned.family,
        agent: false,
        // node:https has no redirect-following behavior. Every 3xx fails below.
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status !== 200) {
          const code =
            status >= 300 && status < 400
              ? 'REDIRECT_REJECTED'
              : status === 401
                ? 'UNAUTHORIZED'
                : status === 403
                  ? 'FORBIDDEN'
                  : status === 404
                    ? 'NOT_FOUND'
                    : 'API_ERROR';
          finish(new SentryImportError(code));
          response.destroy();
          return;
        }
        if (
          response.headers['content-encoding'] &&
          response.headers['content-encoding'] !== 'identity'
        ) {
          finish(new SentryImportError('INVALID_RESPONSE'));
          response.destroy();
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            finish(new SentryImportError('RESPONSE_TOO_LARGE'));
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', () => finish(new SentryImportError('NETWORK_ERROR')));
        response.on('end', () => {
          if (complete) return;
          try {
            finish(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            finish(new SentryImportError('INVALID_RESPONSE'));
          }
        });
      },
    );
    req.on('error', () => finish(new SentryImportError('NETWORK_ERROR')));
    timeout = setTimeout(
      () => {
        finish(new SentryImportError('REQUEST_TIMEOUT'));
        req.destroy();
      },
      Math.max(1, deadline - Date.now()),
    );
    req.end();
  });
}
