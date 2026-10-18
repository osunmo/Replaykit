import { SentryImportError } from './errors.js';
import { eventTraceId, normalizeSentryEvent } from './normalize.js';
import { parseSentryIssueUrl } from './security.js';
import {
  SupportedRevisionsSchema,
  type SentryImportResult,
  type SupportedRevision,
  type TraceStatus,
} from './schemas.js';
import { requestSentryJson, type TransportOptions } from './transport.js';

export { SentryImportError } from './errors.js';
export type { SentryErrorCode } from './errors.js';
export {
  normalizeSentryEvent,
  normalizeSentryFrame,
  redactSentryText,
  sanitizeSyntheticFixture,
} from './normalize.js';
export { parseSentryIssueUrl } from './security.js';
export * from './schemas.js';
export interface SentryImportOptions extends TransportOptions {
  token?: string;
  supportedRevisions: SupportedRevision[];
}
export async function importSentryIssue(
  input: string,
  options: SentryImportOptions,
): Promise<SentryImportResult> {
  // Validate every untrusted URL component before credentials or authenticated transport.
  const location = parseSentryIssueUrl(input, options.selfHostedBaseUrl);
  const mappings = SupportedRevisionsSchema.safeParse(options.supportedRevisions);
  if (!mappings.success) throw new SentryImportError('INVALID_REVISION_MAPPING');
  if (!options.token) throw new SentryImportError('MISSING_TOKEN');
  const api = new URL(
    `/api/0/organizations/${location.organization}/issues/${location.issueId}/events/${location.eventId ?? 'latest'}/`,
    location.origin,
  );
  const transportOptions: TransportOptions = {
    selfHostedBaseUrl: options.selfHostedBaseUrl,
    timeoutMs: options.timeoutMs,
    maxResponseBytes: options.maxResponseBytes,
  };
  let raw: unknown;
  try {
    raw = await requestSentryJson(api, options.token, transportOptions);
  } catch (error) {
    throw error instanceof SentryImportError ? error : new SentryImportError('NETWORK_ERROR');
  }
  // Check release and required shape before making optional trace requests.
  let basic: SentryImportResult;
  try {
    basic = normalizeSentryEvent(raw, location, mappings.data, { token: options.token });
  } catch (error) {
    throw error instanceof SentryImportError ? error : new SentryImportError('INVALID_RESPONSE');
  }
  const traceId = eventTraceId(raw);
  if (!traceId) return basic;
  const traceApi = new URL(
    `/api/0/organizations/${location.organization}/trace/${traceId}/`,
    location.origin,
  );
  // An explicit window around the actual event avoids implicitly querying only recent traces.
  const timestamp = Date.parse(basic.incident.timestamp);
  traceApi.searchParams.set('start', new Date(timestamp - 86_400_000).toISOString());
  traceApi.searchParams.set('end', new Date(timestamp + 86_400_000).toISOString());
  traceApi.searchParams.set('errorId', basic.provenance.eventId);
  let traceRaw: unknown;
  let traceMissing: Exclude<TraceStatus, 'AVAILABLE' | 'NO_TRACE_ID'> | undefined;
  try {
    traceRaw = await requestSentryJson(traceApi, options.token, transportOptions);
    if (!Array.isArray(traceRaw)) traceMissing = 'TRACE_UNAVAILABLE';
  } catch (error) {
    traceMissing =
      error instanceof SentryImportError &&
      (error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED')
        ? 'TRACE_SCOPE_MISSING'
        : error instanceof SentryImportError && error.code === 'NOT_FOUND'
          ? 'TRACE_NOT_FOUND'
          : 'TRACE_UNAVAILABLE';
  }
  try {
    return normalizeSentryEvent(raw, location, mappings.data, {
      token: options.token,
      traceRaw,
      traceMissing,
    });
  } catch (error) {
    throw error instanceof SentryImportError ? error : new SentryImportError('INVALID_RESPONSE');
  }
}
