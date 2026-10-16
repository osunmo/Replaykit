import { z } from 'zod';

const shortText = z.string().min(1).max(256);
const identifier = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) => [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
    'Control characters are not allowed',
  );
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const PaymentRequestSchema = z.strictObject({
  orderId: identifier,
  idempotencyKey: identifier,
  amount: z.number().int().positive().max(100_000_000),
});
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;
export const FailureIdentitySchema = z.strictObject({
  type: shortText,
  topApplicationFrame: shortText,
});
export const TierSchema = z.enum(['full', 'partial', 'minimal']);
export const BreadcrumbSchema = z.object({
  category: shortText,
  message: z.string().max(2048),
  data: z.record(z.string(), z.unknown()).optional(),
});
export const SpanSchema = z.object({
  traceId: shortText,
  spanId: shortText,
  name: shortText,
  attributes: z.record(z.string(), z.unknown()),
});
export const IncidentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: shortText,
    service: shortText,
    revision: shortText,
    timestamp: z.iso.datetime(),
    telemetryTier: TierSchema,
    exception: FailureIdentitySchema.extend({ message: z.string().max(4096) }),
    request: PaymentRequestSchema.optional(),
    breadcrumbs: z.array(BreadcrumbSchema).max(1000),
    spans: z.array(SpanSchema).max(1000),
    missingEvidence: z.array(shortText).max(100),
    metadata: z.record(z.string(), z.unknown()),
  })
  .superRefine((value, ctx) => {
    if (
      value.telemetryTier === 'minimal' &&
      (value.request || value.spans.length || value.breadcrumbs.length)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Minimal telemetry may contain stack evidence only',
      });
    if (!value.request && !value.missingEvidence.includes('request.body'))
      ctx.addIssue({ code: 'custom', message: 'Absent request body must be declared' });
  });
export type Incident = z.infer<typeof IncidentSchema>;
export const EvidenceBundleSchema = z.strictObject({
  schemaVersion: z.literal(1),
  incident: IncidentSchema,
  inputHash: HashSchema,
  sanitized: z.literal(true),
  provenance: z.array(shortText),
});
export const ReplayPlanSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    incidentId: shortText,
    status: z.enum(['READY', 'ABSTAIN']),
    testSource: z.string().max(32_768).nullable(),
    request: PaymentRequestSchema.optional(),
    reasonCodes: z.array(shortText),
    missingEvidence: z.array(shortText),
    assumptions: z.array(z.string().max(2048)),
    sourceHash: HashSchema,
  })
  .superRefine((value, ctx) => {
    if (value.status === 'READY' && (!value.testSource?.trim() || !value.request))
      ctx.addIssue({
        code: 'custom',
        message: 'READY requires a test and evidence-backed request',
      });
    if (value.status === 'ABSTAIN' && (!value.reasonCodes.length || value.testSource !== null))
      ctx.addIssue({ code: 'custom', message: 'ABSTAIN requires a reason and no test' });
  });
export type ReplayPlan = z.infer<typeof ReplayPlanSchema>;
export const ScheduleEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  kind: shortText,
  checkpoint: shortText,
});
export const ExecutionEvidenceSchema = z.strictObject({
  runId: shortText,
  variantHash: HashSchema,
  candidateHash: HashSchema,
  executionStatus: z.enum(['COMPLETED', 'ERROR']),
  exitCode: z.number().int().nullable(),
  failure: FailureIdentitySchema.nullable(),
  charges: z.number().int().nonnegative().nullable(),
  requests: z.number().int().nonnegative(),
  cleanDatabase: z.boolean(),
  isolated: z.boolean(),
  offline: z.boolean(),
  schedule: z.array(ScheduleEventSchema),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  error: z.string().optional(),
  incident: z.unknown().optional(),
});
export type ExecutionEvidence = z.infer<typeof ExecutionEvidenceSchema>;
const gate = z.boolean().nullable();
export const JudgeResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  incidentId: shortText,
  runId: shortText,
  status: z.enum(['VERIFIED', 'PARTIAL', 'NOT_REPRODUCED', 'ERROR']),
  telemetryTier: TierSchema,
  failureMatch: FailureIdentitySchema,
  checks: z.strictObject({
    buggyFails: gate,
    sameFailureIdentity: gate,
    referenceFixPasses: gate,
    alternateFixPasses: gate,
    decoyFixStillFails: gate,
    deterministicRuns: z.number().int().nonnegative(),
    deterministicFailures: z.number().int().nonnegative(),
    offlineExecution: gate,
    isolatedExecution: gate,
    freshState: gate,
    noSleepBasedTiming: gate,
    reviewableTest: gate,
    sameCandidate: gate,
  }),
  missingEvidence: z.array(shortText),
  reasonCodes: z.array(shortText),
  testArtifact: z.string().nullable(),
  durationMs: z.number().nonnegative(),
  tokens: z.number().nonnegative().nullable(),
  metadata: z.record(z.string(), z.unknown()),
});
export type JudgeResult = z.infer<typeof JudgeResultSchema>;
