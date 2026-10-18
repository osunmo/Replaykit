import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HashSchema, IncidentSchema } from '../../contracts/src/index.js';

const text = z.string().min(1).max(256);
const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
export const SupportedRevisionSchema = z.strictObject({
  release: text,
  service: z.literal('checkout-api'),
  revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  applicationSourceHash: HashSchema,
});
export const SupportedRevisionsSchema = z
  .array(SupportedRevisionSchema)
  .max(100)
  .refine(
    (items) => new Set(items.map((item) => item.release)).size === items.length,
    'Each opaque release must map to exactly one approved snapshot',
  );
export type SupportedRevision = z.infer<typeof SupportedRevisionSchema>;
export const TraceStatusSchema = z.enum([
  'AVAILABLE',
  'NO_TRACE_ID',
  'TRACE_SCOPE_MISSING',
  'TRACE_NOT_FOUND',
  'TRACE_UNAVAILABLE',
]);
export type TraceStatus = z.infer<typeof TraceStatusSchema>;
export const ProjectSchema = z.strictObject({
  id: z
    .string()
    .regex(/^\d{1,32}$/)
    .optional(),
  slug: identifier.optional(),
});
export const SentryProvenanceSchema = z.strictObject({
  adapter: z.literal('sentry-api-v1'),
  origin: z.url(),
  organization: identifier,
  project: ProjectSchema,
  issueId: z.string().regex(/^\d{1,32}$/),
  eventId: z.string().regex(/^[a-f0-9]{32}$/),
  selection: z.enum(['latest', 'explicit']),
  release: text,
  revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  applicationSourceHash: HashSchema,
  importedAt: z.iso.datetime(),
  eventTimestamp: z.iso.datetime(),
  normalizedIncidentHash: HashSchema,
  trace: z.strictObject({
    id: z
      .string()
      .regex(/^[a-f0-9]{32}$/)
      .optional(),
    status: TraceStatusSchema,
  }),
  sanitized: z.literal(true),
});
export const SentrySummarySchema = z.strictObject({
  organization: identifier,
  project: ProjectSchema,
  issueId: z.string().regex(/^\d{1,32}$/),
  eventId: z.string().regex(/^[a-f0-9]{32}$/),
  release: text,
  exceptionType: text,
  topApplicationFrame: text,
  missingEvidence: z.array(text).max(100),
  traceStatus: TraceStatusSchema,
  spanCount: z.number().int().nonnegative().optional(),
  untrustedIncidentText: z.literal(true),
});
export const SentryImportResultSchema = z
  .strictObject({
    incident: IncidentSchema,
    provenance: SentryProvenanceSchema,
    summary: SentrySummarySchema,
  })
  .superRefine((val, ctx) => {
    const hash = createHash('sha256').update(JSON.stringify(val.incident)).digest('hex');
    if (hash !== val.provenance.normalizedIncidentHash) {
      ctx.addIssue({ code: 'custom', message: 'Incident hash does not match provenance' });
    }
    if (
      val.incident.id !== val.provenance.eventId ||
      val.summary.eventId !== val.provenance.eventId
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Event ID mismatch between incident, provenance, and summary',
      });
    }
    if (val.incident.timestamp !== val.provenance.eventTimestamp) {
      ctx.addIssue({
        code: 'custom',
        message: 'Timestamp mismatch between incident and provenance',
      });
    }
  });
export type SentryImportResult = z.infer<typeof SentryImportResultSchema>;
export type SentryProvenance = z.infer<typeof SentryProvenanceSchema>;
export type SentrySummary = z.infer<typeof SentrySummarySchema>;
