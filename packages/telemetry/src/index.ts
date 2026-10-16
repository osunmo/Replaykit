import { z } from 'zod';
import {
  BreadcrumbSchema,
  IncidentSchema,
  PaymentRequestSchema,
  SpanSchema,
  TierSchema,
  type Incident,
} from '../../contracts/src/index.js';

const sensitiveKey =
  /authorization|cookie|password|secret|token|email|phone|address|card|cvv|ssn|iban/i;
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 20) return '[TRUNCATED]';
  if (typeof value === 'string')
    return value
      .replace(/Bearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[REDACTED]')
      .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED]');
  if (Array.isArray(value)) return value.slice(0, 1000).map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 1000)
        .map(([key, item]) => [
          key,
          sensitiveKey.test(key) ? '[REDACTED]' : redact(item, depth + 1),
        ]),
    );
  return value;
}
export function normalizeFrame(frame: string): string {
  return frame
    .replace(/^async\s+/, '')
    .replace(/\\/g, '/')
    .replace(/\./g, '/')
    .replace(/\s+\(.*$/, '');
}
const EventSchema = z.object({
  event_id: z.string(),
  release: z.string(),
  timestamp: z.string(),
  exception: z.object({
    values: z
      .array(
        z.object({
          type: z.string(),
          value: z.string(),
          stacktrace: z.object({
            frames: z.array(z.object({ function: z.string(), in_app: z.boolean().optional() })),
          }),
        }),
      )
      .min(1),
  }),
  request: z.object({ data: z.unknown().optional() }).optional(),
  breadcrumbs: z.array(BreadcrumbSchema).default([]),
  spans: z.array(SpanSchema).default([]),
});
export function normalizeIncident(
  raw: unknown,
  selectedTier: z.infer<typeof TierSchema>,
): Incident {
  const tier = TierSchema.parse(selectedTier);
  const event = EventSchema.parse(redact(raw));
  const exception = event.exception.values.at(-1)!;
  const frame = exception.stacktrace.frames.filter((item) => item.in_app).at(-1);
  if (!frame) throw new Error('Incident has no application frame');
  const body = PaymentRequestSchema.safeParse(event.request?.data);
  const request = tier === 'full' && body.success ? body.data : undefined;
  return IncidentSchema.parse({
    schemaVersion: 1,
    id: event.event_id,
    service: 'checkout-api',
    revision: event.release,
    timestamp: event.timestamp,
    telemetryTier: tier,
    exception: {
      type: exception.type,
      message: exception.value,
      topApplicationFrame: normalizeFrame(frame.function),
    },
    ...(request ? { request } : {}),
    breadcrumbs: tier === 'minimal' ? [] : event.breadcrumbs,
    spans: tier === 'minimal' ? [] : event.spans,
    missingEvidence: [
      ...(!request ? ['request.body'] : []),
      ...(tier === 'minimal' ? ['spans', 'breadcrumbs'] : []),
    ],
    metadata: { adapter: 'sentry-shaped-v1', sanitized: true },
  });
}
