import { z } from 'zod';

// Cryptographic hash schema
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/);

/**
 * 1. Error Identity & Stack Trace
 */
export const StackFrameSchema = z.strictObject({
  filename: z.string().min(1),
  function: z.string().min(1),
  lineno: z.number().int().positive(),
  colno: z.number().int().positive().nullable(),
  inApp: z.boolean(),
  contextLine: z.string().nullable().optional(),
  preContext: z.array(z.string()).optional(),
  postContext: z.array(z.string()).optional(),
  vars: z.record(z.string(), z.string()).optional(), // Redacted local variables
});

export const ErrorTelemetrySchema = z.strictObject({
  type: z.string().min(1), // e.g. "TypeError", "AssertionError"
  value: z.string(), // e.g. "source.hasOwnProperty is not a function"
  module: z.string().optional(),
  topApplicationFrame: z.string().min(1), // e.g. "at exports.clone (/case/lib/utils.js:47:20)"
  frames: z.array(StackFrameSchema).min(1),
  handled: z.boolean(),
});

/**
 * 2. HTTP Request Context (Sanitized)
 */
export const HttpRequestContextSchema = z.strictObject({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']),
  url: z.string().url(),
  path: z.string().min(1),
  queryString: z.string().optional(),
  headers: z.record(z.string(), z.string()), // Sanitized headers
  bodySanitized: z.unknown().nullable(), // Parsed JSON or string, PII redacted
  rawBodySha256: Sha256Schema.optional(),
  clientIpRedacted: z
    .string()
    .regex(/^([0-9]{1,3}\.){3}0$|^[a-f0-9:]+:0$/)
    .optional(), // Subnet masked
});

/**
 * 3. Sentry Breadcrumbs & Telemetry Events
 */
export const BreadcrumbSchema = z.strictObject({
  timestamp: z.string().datetime(),
  category: z.enum(['http', 'navigation', 'query', 'ui.click', 'console', 'system', 'custom']),
  level: z.enum(['fatal', 'error', 'warning', 'info', 'debug']),
  message: z.string().max(2048).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

/**
 * 4. Runtime Configuration & Environment
 */
export const RuntimeEnvironmentSchema = z.strictObject({
  nodeVersion: z.string().regex(/^v\d+\.\d+\.\d+/),
  os: z.enum(['linux', 'darwin', 'win32']),
  arch: z.enum(['x64', 'arm64']),
  containerImageDigest: z
    .string()
    .regex(/^[a-zA-Z0-9._/:-]+@sha256:[a-f0-9]{64}$/)
    .optional(),
  environmentVariables: z.record(
    z.string(),
    z.strictObject({
      valueRedacted: z.string(),
      isSecret: z.boolean(),
    }),
  ),
});

/**
 * 5. State Transitions & Fixture Snapshots
 */
export const DatabaseFixtureSchema = z.strictObject({
  table: z.string(),
  snapshotType: z.enum(['row_state', 'schema_only', 'synthetic_mock']),
  authorizedBy: z.string().min(1),
  records: z.array(z.record(z.string(), z.unknown())),
});

export const StateTransitionSchema = z.strictObject({
  sequence: z.number().int().nonnegative(),
  entity: z.string(),
  fromState: z.string(),
  toState: z.string(),
  triggerEvent: z.string(),
  timestamp: z.string().datetime(),
});

/**
 * 6. Behavioral Oracle & Provenance
 */
export const OracleProvenanceSchema = z.strictObject({
  sourceType: z.enum([
    'api_documentation', // Official documentation provided in repo
    'openapi_contract', // OpenAPI / JSON schema specification
    'type_definition', // TypeScript interface or JSDoc contract
    'upstream_issue_spec', // Explicit issue description text
    'inferred', // Inferred by LLM from function semantics
  ]),
  referenceUri: z.string().optional(),
  confidence: z.enum(['definitive', 'high', 'ambiguous', 'unknown']),
  expectedOutcome: z.strictObject({
    shouldThrow: z.boolean(),
    expectedExceptionType: z.string().optional(),
    expectedReturnValue: z.unknown().optional(),
    expectedStateMutations: z.record(z.string(), z.unknown()).optional(),
  }),
  specification: z.string().optional(),
});

/**
 * 7. Epistemic Classification (Oracle Completeness)
 */
export const OracleSufficiencySchema = z.strictObject({
  status: z.enum(['SUFFICIENT', 'INSUFFICIENT_ORACLE', 'MISSING_TRIGGERING_INPUT', 'AMBIGUOUS_SPEC']),
  missingFields: z.array(z.string()),
  blockingReason: z.string().nullable(),
});

/**
 * 8. Top-Level Production Incident Context Schema
 */
export const ProductionIncidentContextSchema = z.strictObject({
  schemaVersion: z.literal('incident-context-v1'),
  incidentId: z.string().uuid(),
  createdAt: z.string().datetime(),
  sourceRevision: z.strictObject({
    gitSha: GitCommitSchema,
    repository: z.string().min(1),
    branch: z.string().optional(),
  }),
  error: ErrorTelemetrySchema,
  request: HttpRequestContextSchema.nullable(),
  breadcrumbs: z.array(BreadcrumbSchema),
  runtime: RuntimeEnvironmentSchema,
  databaseFixtures: z.array(DatabaseFixtureSchema).optional(),
  stateTransitions: z.array(StateTransitionSchema).optional(),
  oracle: OracleProvenanceSchema,
  sufficiency: OracleSufficiencySchema,
});

export type ProductionIncidentContext = z.infer<typeof ProductionIncidentContextSchema>;

/**
 * 9. Blind AI Synthesis Execution Manifest & Results
 */
export const BlindSynthesisSettingsSchema = z.strictObject({
  model: z.string(),
  provider: z.string(),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
  endpoint: z.string().url().optional(),
});

export const BlindSynthesisResultSchema = z.strictObject({
  trialId: z.string().uuid(),
  timestamp: z.string().datetime(),
  classification: z.enum(['CONTRACT_CONDITIONED_SYNTHESIS', 'INSUFFICIENT_ORACLE_CONTROL']),
  settings: BlindSynthesisSettingsSchema,
  incidentContextSha256: Sha256Schema,
  status: z.enum(['SYNTHESIS_SUCCESS', 'INSUFFICIENT_ORACLE', 'GENERATION_ERROR']),
  testFile: z.string().optional(),
  testSource: z.string().nullable(),
  testSha256: Sha256Schema.nullable(),
  durationMs: z.number().nonnegative(),
  prompt: z.string().optional(),
  rawModelResponse: z.string().optional(),
  assertionProvenance: z.string().optional(),
  toolPermissions: z.array(z.string()).optional(),
  blindingEvidence: z.record(z.string(), z.unknown()).optional(),
  tokenUsage: z
    .strictObject({
      promptTokens: z.number().int().nonnegative().optional(),
      completionTokens: z.number().int().nonnegative().optional(),
      totalTokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
  astChecks: z
    .strictObject({
      validSyntax: z.boolean(),
      noBannedApis: z.boolean(),
      distinctFromUpstream: z.boolean(),
      levenshteinDistanceToTest40: z.number().int().nonnegative(),
    })
    .optional(),
  reason: z.string().optional(),
});

export type BlindSynthesisResult = z.infer<typeof BlindSynthesisResultSchema>;
