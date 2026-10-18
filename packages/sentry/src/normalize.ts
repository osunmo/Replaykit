import { createHash } from 'node:crypto';
import { IncidentSchema, PaymentRequestSchema, type Incident } from '../../contracts/src/index.js';
import { SentryImportError } from './errors.js';
import { eventIdPattern, type SentryIssueLocation } from './security.js';
import {
  SentryImportResultSchema,
  SupportedRevisionsSchema,
  type SentryImportResult,
  type SupportedRevision,
  type TraceStatus,
} from './schemas.js';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : {};
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
const unavailablePattern = /\[(?:filtered|redacted|truncated|removed)\]|\{snip\}|\u2026/i;
function unavailable(value: unknown, depth = 0): boolean {
  if (depth > 12) return true;
  if (typeof value === 'string') return unavailablePattern.test(value);
  if (Array.isArray(value)) return value.some((item) => unavailable(item, depth + 1));
  if (value && typeof value === 'object')
    return Object.values(value).some((item) => unavailable(item, depth + 1));
  return false;
}
function annotations(value: unknown, depth = 0): boolean {
  if (depth > 12) return true;
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object')
    return Object.entries(value).some(
      ([key, item]) =>
        (['rem', 'len', 'err'].includes(key) && item !== null && item !== undefined) ||
        annotations(item, depth + 1),
    );
  return true;
}
export function redactSentryText(value: string, token?: string): string {
  let result = token && token.length >= 8 ? value.split(token).join('[REDACTED]') : value;
  result = result
    .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
    .replace(
      /\b(?:sntrys_|sntryu_|sntryi_|sntryo_|sntrya_|sntry[a-z0-9_]*_)[a-zA-Z0-9_.-]+/gi,
      '[REDACTED]',
    )
    .replace(/\b(?:sk_|ghp_|github_pat_)[a-zA-Z0-9_.-]+/gi, '[REDACTED]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[REDACTED]')
    .replace(/https?:\/\/[^\s/]+:[^\s@]+@[^\s]+/gi, '[REDACTED]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED]')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  return result;
}
function safeEvidenceText(value: unknown, token?: string, max = 128): string | undefined {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > max ||
    unavailable(value) ||
    redactSentryText(value, token) !== value
  )
    return undefined;
  return value;
}
export function normalizeSentryFrame(raw: unknown): string {
  const frame = object(raw);
  if (frame.inApp !== true && frame.in_app !== true)
    throw new SentryImportError('NO_APPLICATION_FRAME');
  const filename = text(frame.filename) ?? text(frame.absPath) ?? text(frame.abs_path);
  const func = text(frame.function)
    ?.replace(/^async\s+/, '')
    .split('.')
    .at(-1);
  const stem = filename
    ?.replaceAll('\\', '/')
    .split('/')
    .at(-1)
    ?.replace(/\.(?:[cm]?js|tsx?)$/, '');
  if (
    !filename ||
    !/\.(?:[cm]?js|tsx?)$/.test(filename) ||
    !stem ||
    !/^[\w-]+$/.test(stem) ||
    !func ||
    !/^[\w$]+$/.test(func)
  )
    throw new SentryImportError('NO_APPLICATION_FRAME');
  return `${stem}/${func}`;
}
export function eventTraceId(raw: unknown): string | undefined {
  const trace = object(object(object(raw).contexts).trace);
  const id = text(trace.trace_id) ?? text(trace.traceId);
  return id && eventIdPattern.test(id) ? id.toLowerCase() : undefined;
}
interface NormalizationOptions {
  token?: string;
  traceRaw?: unknown;
  traceMissing?: Exclude<TraceStatus, 'AVAILABLE' | 'NO_TRACE_ID'>;
}
export function normalizeSentryEvent(
  raw: unknown,
  location: SentryIssueLocation,
  supportedRevisions: SupportedRevision[],
  options: NormalizationOptions = {},
): SentryImportResult {
  const parsedRevisions = SupportedRevisionsSchema.safeParse(supportedRevisions);
  if (!parsedRevisions.success) throw new SentryImportError('INVALID_REVISION_MAPPING');
  const event = object(raw),
    meta = object(event._meta),
    entries = array(event.entries);
  if (!entries.length) throw new SentryImportError('INVALID_RESPONSE');
  const entry = (type: string) => object(entries.find((item) => object(item).type === type));
  const entryMeta = (type: string) =>
    object(object(meta.entries)[String(entries.findIndex((item) => object(item).type === type))]);
  const eventId = text(event.eventID) ?? text(event.event_id);
  if (!eventId || !eventIdPattern.test(eventId)) throw new SentryImportError('INVALID_RESPONSE');
  if (location.eventId && eventId.toLowerCase() !== location.eventId)
    throw new SentryImportError('EVENT_ID_MISMATCH');
  if (event.groupID !== undefined && String(event.groupID) !== location.issueId)
    throw new SentryImportError('EVENT_ID_MISMATCH');
  const release = text(event.release) ?? text(object(event.release).version);
  const revision = parsedRevisions.data.find((item) => item.release === release);
  if (!revision || !safeEvidenceText(release, options.token, 256))
    throw new SentryImportError('UNSUPPORTED_REVISION');
  const date = text(event.dateCreated) ?? text(event.timestamp);
  const timestamp =
    date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : undefined;
  if (!timestamp) throw new SentryImportError('INVALID_RESPONSE');
  const exception = object(array(object(entry('exception').data).values).at(-1));
  const type = safeEvidenceText(exception.type, options.token, 256);
  if (!type || !/^[\w.$-]+$/.test(type)) throw new SentryImportError('INVALID_RESPONSE');
  const frames = array(object(exception.stacktrace).frames);
  const top = frames
    .filter((item) => object(item).inApp === true || object(item).in_app === true)
    .at(-1);
  if (annotations(entryMeta('exception'))) throw new SentryImportError('NO_APPLICATION_FRAME');
  const normalizedFrame = normalizeSentryFrame(top);
  if (!safeEvidenceText(normalizedFrame, options.token, 256))
    throw new SentryImportError('NO_APPLICATION_FRAME');
  const missing = new Set<string>();
  let rawBody = object(entry('request').data).data;
  if (typeof rawBody === 'string' && rawBody.length <= 8192 && !unavailable(rawBody)) {
    try {
      rawBody = JSON.parse(rawBody);
    } catch {
      rawBody = undefined;
    }
  }
  const body = PaymentRequestSchema.safeParse(rawBody);
  const request =
    body.success &&
    !unavailable(rawBody) &&
    !annotations(entryMeta('request')) &&
    !annotations(meta.request) &&
    safeEvidenceText(body.data.orderId, options.token) &&
    safeEvidenceText(body.data.idempotencyKey, options.token)
      ? body.data
      : undefined;
  if (!request) missing.add('request.body');
  const breadcrumbs: Incident['breadcrumbs'] = [];
  const crumbs = array(object(entry('breadcrumbs').data).values);
  if (annotations(entryMeta('breadcrumbs'))) missing.add('breadcrumbs.redacted_or_truncated');
  else
    for (const item of crumbs.slice(0, 100)) {
      const crumb = object(item),
        category = safeEvidenceText(crumb.category, options.token, 256);
      const message = text(crumb.message);
      if (!category || message === undefined || unavailable(item)) {
        missing.add('breadcrumbs.redacted_or_truncated');
        continue;
      }
      const data = object(crumb.data),
        safeData: RecordValue = {};
      for (const field of ['clientKey', 'providerKey', 'orderId']) {
        const value = safeEvidenceText(data[field], options.token);
        if (value !== undefined) safeData[field] = value;
      }
      if (
        Number.isInteger(data.amount) &&
        Number(data.amount) > 0 &&
        Number(data.amount) <= 100_000_000
      )
        safeData.amount = data.amount;
      breadcrumbs.push({
        category,
        message: redactSentryText(message, options.token).slice(0, 2048),
        ...(Object.keys(safeData).length ? { data: safeData } : {}),
      });
    }
  if (!breadcrumbs.length) missing.add('breadcrumbs');
  if (crumbs.length > 100) missing.add('breadcrumbs.truncated');
  const traceId = eventTraceId(event);
  const spans: Incident['spans'] = [];
  const traceStatus: TraceStatus = !traceId
    ? 'NO_TRACE_ID'
    : (options.traceMissing ??
      (Array.isArray(options.traceRaw) && options.traceRaw.length
        ? 'AVAILABLE'
        : 'TRACE_NOT_FOUND'));
  if (traceStatus !== 'AVAILABLE') missing.add(`trace.${traceStatus}`);
  const walkSpans = (items: unknown[], depth = 0) => {
    if (depth > 12 || spans.length >= 100) {
      missing.add('spans.truncated');
      return;
    }
    for (const item of items.slice(0, 100)) {
      const span = object(item);
      const spanId = text(span.span_id) ?? text(span.spanId);
      const eventSpanId = text(span.event_id) ?? text(span.eventId);
      const name = text(span.op) ?? text(span.name);
      if (
        spanId &&
        /^[a-f0-9]{16}$/i.test(spanId) &&
        name &&
        safeEvidenceText(name, options.token, 256) &&
        traceId
      ) {
        spans.push({ traceId, spanId: spanId.toLowerCase(), name, attributes: {} });
      } else if (
        eventSpanId &&
        /^[a-f0-9]{32}$/i.test(eventSpanId) &&
        name &&
        safeEvidenceText(name, options.token, 256) &&
        traceId
      ) {
        spans.push({
          traceId,
          spanId: eventSpanId.toLowerCase(),
          name,
          attributes: { 'sentry.identifierKind': 'event_id' },
        });
      }
      walkSpans(array(span.children), depth + 1);
      if (spans.length >= 100) break;
    }
  };
  if (traceStatus === 'AVAILABLE') walkSpans(array(options.traceRaw));
  if (!spans.length) missing.add('spans');
  const project = object(event.project);
  const projectId =
    text(event.projectID) ??
    text(project.id) ??
    (typeof event.project === 'number' ? String(event.project) : undefined);
  const projectSlug = text(event.projectSlug) ?? text(project.slug);
  const safeProject = {
    ...(projectId && /^\d{1,32}$/.test(projectId) ? { id: projectId } : {}),
    ...(projectSlug &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(projectSlug) &&
    safeEvidenceText(projectSlug, options.token)
      ? { slug: projectSlug }
      : {}),
  };
  if (!Object.keys(safeProject).length) missing.add('project');
  const missingEvidence = [...missing];
  const incident = IncidentSchema.parse({
    schemaVersion: 1,
    id: eventId.toLowerCase(),
    service: revision.service,
    revision: revision.revision,
    timestamp,
    telemetryTier: request && spans.length && breadcrumbs.length ? 'full' : 'partial',
    exception: {
      type,
      topApplicationFrame: normalizedFrame,
      message: redactSentryText(text(exception.value) ?? '', options.token).slice(0, 4096),
    },
    ...(request ? { request } : {}),
    breadcrumbs,
    spans,
    missingEvidence,
    metadata: {
      adapter: 'sentry-api-v1',
      sanitized: true,
      untrustedIncidentText: true,
      applicationFrames: [normalizedFrame],
    },
  });
  const normalizedIncidentHash = createHash('sha256')
    .update(JSON.stringify(incident))
    .digest('hex');
  const result = SentryImportResultSchema.parse({
    incident,
    provenance: {
      adapter: 'sentry-api-v1',
      origin: location.origin,
      organization: location.organization,
      project: safeProject,
      issueId: location.issueId,
      eventId: eventId.toLowerCase(),
      selection: location.eventId ? 'explicit' : 'latest',
      release,
      revision: revision.revision,
      applicationSourceHash: revision.applicationSourceHash,
      importedAt: new Date().toISOString(),
      eventTimestamp: timestamp,
      normalizedIncidentHash,
      trace: { ...(traceId ? { id: traceId } : {}), status: traceStatus },
      sanitized: true,
    },
    summary: {
      organization: location.organization,
      project: safeProject,
      issueId: location.issueId,
      eventId: eventId.toLowerCase(),
      release,
      exceptionType: type,
      topApplicationFrame: normalizedFrame,
      missingEvidence,
      traceStatus,
      spanCount: spans.length,
      untrustedIncidentText: true,
    },
  });
  if (options.token && JSON.stringify(result).includes(options.token))
    throw new SentryImportError('INVALID_RESPONSE');
  return result;
}

/** Publication guard for reviewed synthetic captures. It does not turn real data into synthetic data. */
export function sanitizeSyntheticFixture<T>(value: T, secrets: string[] = []): T {
  const serialized = JSON.stringify(value);
  if (
    secrets.some((secret) => secret && serialized.includes(secret)) ||
    /\b(?:sntrys_|sntryu_|sntryi_|sntryo_|sntrya_|sntry[a-z0-9_]*_|sk_|ghp_|github_pat_)[a-zA-Z0-9_.-]+|Bearer\s+\S+|https?:\/\/[^\s/]+:[^\s@]+@/i.test(
      serialized,
    ) ||
    /"(?:authorization|cookie|password|secret|token|dsn)"\s*:\s*"(?!\[REDACTED\])[^"\s]+"/i.test(
      serialized,
    )
  )
    throw new SentryImportError('UNSAFE_FIXTURE');
  for (const email of serialized.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [])
    if (!email.endsWith('@example.invalid')) throw new SentryImportError('UNSAFE_FIXTURE');
  for (const ip of serialized.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [])
    if (!/^(?:192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(ip))
      throw new SentryImportError('UNSAFE_FIXTURE');
  // Public fixtures use no IPv6 addresses; reject recognisable IPv6 literals conservatively.
  if (/(?:[a-f0-9]{0,4}:){2,}[a-f0-9]{0,4}/i.test(serialized.replace(/\d{2}:\d{2}:\d{2}/g, '')))
    throw new SentryImportError('UNSAFE_FIXTURE');
  return JSON.parse(serialized) as T;
}
