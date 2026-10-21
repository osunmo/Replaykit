# Production Incident Context Schema & Contract Specification

**Document Version:** 1.0.0  
**Date:** 2026-10-20  
**Status:** PROPOSED SCHEMA FOR FUTURE PRODUCTION-INCIDENT ADAPTERS  
**Target:** Standardized Incident Payload Contract for ReplayKit AI Test Generation & Reproduction  

---

## 1. Objective & Principles

To enable ReplayKit to synthesize authentic regression tests from production incidents (such as Sentry alerts, Datadog traces, or HTTP server crashes), we define a formal, strongly-typed schema for production incident context.

### Architectural Principles:
1. **Zero Raw Secret Ingress**: All environment variables, headers, and bodies MUST be sanitized/redacted at the ingestion edge before serialization.
2. **Explicit Behavioral Provenance**: Expected behavior assertions MUST track their source (e.g., API documentation, OpenAPI contract, user specification, or inferred) and MUST NOT be fabricated.
3. **Epistemic Classification**: If required information is absent or ambiguous, the payload MUST declare missing context and classify whether the oracle is sufficient or insufficient.
4. **Reproducibility Binding**: The incident payload binds exact source revision (`gitSha`), runtime version, and dependency lockfile digests.

---

## 2. Comprehensive Schema Definition (TypeScript & Zod)

The complete schema is modeled in strict TypeScript/Zod:

```typescript
import { z } from 'zod';

// Cryptographic hash schema
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/);

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
  value: z.string(),       // e.g. "source.hasOwnProperty is not a function"
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
  headers: z.record(z.string(), z.string()), // Sanitized headers (Authorization/Cookies stripped)
  bodySanitized: z.unknown().nullable(),    // Parsed JSON or string, PII redacted
  rawBodySha256: Sha256Schema.optional(),
  clientIpRedacted: z.string().regex(/^([0-9]{1,3}\.){3}0$|^[a-f0-9:]+:0$/).optional(), // Subnet masked
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
  containerImageDigest: z.string().regex(/^[a-zA-Z0-9._/:-]+@sha256:[a-f0-9]{64}$/).optional(),
  environmentVariables: z.record(
    z.string(),
    z.strictObject({
      valueRedacted: z.string(), // "[REDACTED]" or public string
      isSecret: z.boolean(),
    })
  ),
});

/**
 * 5. State Transitions & Fixture Snaphots
 */
export const DatabaseFixtureSchema = z.strictObject({
  table: z.string(),
  snapshotType: z.enum(['row_state', 'schema_only', 'synthetic_mock']),
  authorizedBy: z.string().min(1), // User or system role granting fixture export
  records: z.array(z.record(z.string(), z.unknown())), // Anonymized records
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
    'api_documentation',   // Official documentation provided in repo
    'openapi_contract',    // OpenAPI / JSON schema specification
    'type_definition',     // TypeScript interface or JSDoc contract
    'upstream_issue_spec', // Explicit issue description text
    'inferred',            // Inferred by LLM from function semantics
  ]),
  referenceUri: z.string().optional(),
  confidence: z.enum(['definitive', 'high', 'ambiguous', 'unknown']),
  expectedOutcome: z.strictObject({
    shouldThrow: z.boolean(),
    expectedExceptionType: z.string().optional(),
    expectedReturnValue: z.unknown().optional(),
    expectedStateMutations: z.record(z.string(), z.unknown()).optional(),
  }),
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
```

---

## 3. Redaction & Privacy Invariants

To comply with enterprise security policies and privacy regulations (GDPR/HIPAA/SOC2):

1. **Header Sanitization**:
   - Headers matching `/^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|token|secret)$/i` MUST be replaced with `"[REDACTED_HEADER]"`.
2. **Body Sanitization**:
   - Recursive inspection of JSON/form bodies.
   - Keys matching `/password|secret|token|api_?key|credit_?card|ssn|cvv|auth/i` MUST be redacted to `"[REDACTED]"`.
   - String values matching token regexes (e.g. Sentry DSNs, AWS keys, JWTs) MUST be replaced with `"[REDACTED_TOKEN]"`.
3. **IP Anonymization**:
   - IPv4 addresses MUST be zero-masked to `/24` subnet (e.g., `192.168.1.0`).
   - IPv6 addresses MUST be zero-masked to `/48` prefix.
4. **Environment Variables**:
   - All environment variables are treated as secret by default unless present on an explicit allowlist of public variables (e.g. `NODE_ENV`, `PORT`, `LOG_LEVEL`).

---

## 4. Oracle Sufficiency Decision Flow

When an incident payload is ingested by ReplayKit:

```
                      +-----------------------------+
                      | Ingest Incident Telemetry   |
                      +--------------+--------------+
                                     |
                                     v
                       Is triggering input present?
                               /          \
                             No            Yes
                            /                \
      +------------------------+      Does behavioral spec define
      | INSUFFICIENT_ORACLE    |      expected output/mutation?
      | (Missing trigger)      |             /          \
      +------------------------+           No            Yes
                                          /                \
                    +------------------------+       +------------------------+
                    | INSUFFICIENT_ORACLE    |       | SUFFICIENT             |
                    | (Ambiguous contract)   |       | -> Proceed to Blind AI |
                    +------------------------+       |    Test Generation     |
                                                     +------------------------+
```

### Classification Criteria:
- **`SUFFICIENT`**: Payload contains both the triggering input and an unambiguous behavioral oracle from API documentation, OpenAPI specs, or TypeScript contracts.
- **`INSUFFICIENT_ORACLE`**: Triggering input is known, but the expected outcome cannot be proven from documented contracts without subjective guessing.
- **`MISSING_TRIGGERING_INPUT`**: The error and stack trace are captured, but the request payload/arguments that caused the exception were dropped or not recorded.
- **`AMBIGUOUS_SPEC`**: Conflicting contracts exist in the documentation.

---

## 5. Medusa Integration Boundary

As instructed by the lead orchestrator:
- **Status:** DEFERRED.
- Integration with Medusa e-commerce incident pipelines remains strictly forbidden until the blind synthesis trial passes Gate D and Gate E validation on standalone benchmarks.
