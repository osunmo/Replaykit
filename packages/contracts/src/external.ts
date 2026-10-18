import { z } from 'zod';
import { FailureIdentitySchema, HashSchema } from './index.js';

const text = z.string().min(1).max(2048);
const file = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.includes('\\') &&
      !value.includes(':') &&
      !value.startsWith('/') &&
      !value.split('/').some((part) => !part || part === '.' || part === '..'),
    'Expected a contained repository-relative path',
  );
const image = z.string().regex(/^[a-zA-Z0-9._/:-]+@sha256:[a-f0-9]{64}$/);
export const ExternalManifestSchema = z
  .strictObject({
    contract: z.literal('external-official-suite-v1'),
    instanceId: text,
    image,
    testPatchHash: HashSchema,
    candidateHash: HashSchema,
    testFile: file.default('test/repro.js'),
    sourceFiles: z.array(file).min(1),
    failToPass: z.array(text).min(1),
    passToPass: z.array(text).min(1),
    expectedFailure: FailureIdentitySchema,
    patchHashes: z.strictObject({
      buggy: HashSchema,
      reference: HashSchema,
      alternate: HashSchema,
      decoy: HashSchema,
    }),
    reviewException: z.string().min(20).max(4096).optional(),
    readonlyRootException: z.string().min(20).max(4096).optional(),
  })
  .superRefine((value, ctx) => {
    if (new Set(Object.values(value.patchHashes)).size !== 4)
      ctx.addIssue({ code: 'custom', message: 'Patch variants must have distinct content hashes' });
    for (const list of [value.sourceFiles, [...value.failToPass, ...value.passToPass]]) {
      if (new Set(list).size !== list.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate manifest inventory' });
    }
  });
export type ExternalManifest = z.infer<typeof ExternalManifestSchema>;
export const OfficialReportSchema = z.strictObject({
  reporter: z.literal('official-suite-normalized-v1'),
  tests: z
    .array(
      z.strictObject({
        name: text,
        status: z.enum(['passed', 'failed', 'skipped']),
        failure: FailureIdentitySchema.nullable(),
      }),
    )
    .min(1)
    .max(10000),
});
export const ExternalExecutionSchema = z.strictObject({
  contract: z.literal('external-official-suite-v1'),
  instanceId: text,
  runId: text,
  image,
  patchHash: HashSchema,
  testPatchHash: HashSchema,
  candidateHash: HashSchema,
  sourceHashes: z.record(file, HashSchema),
  executionStatus: z.enum(['COMPLETED', 'ERROR']),
  exitCode: z.number().int().nullable(),
  reportJson: z
    .string()
    .max(2 * 1024 * 1024)
    .nullable(),
  reportHash: HashSchema.nullable(),
  freshWorkspace: z.boolean(),
  durationMs: z.number().finite().nonnegative(),
  isolation: z.strictObject({
    networkMode: text,
    user: text,
    readonlyRoot: z.boolean(),
    capDropAll: z.boolean(),
    noNewPrivileges: z.boolean(),
    cpus: z.number().positive(),
    memoryBytes: z.number().int().positive(),
    pidsLimit: z.number().int().positive(),
    mounts: z
      .array(
        z.strictObject({
          type: z.literal('tmpfs'),
          destination: z.enum(['/tmp', '/run', '/workspace', '/testbed']),
        }),
      )
      .max(4),
  }),
});
export type ExternalExecution = z.infer<typeof ExternalExecutionSchema>;
export const ExternalMatrixSchema = z.strictObject({
  buggy: z.array(ExternalExecutionSchema),
  reference: z.array(ExternalExecutionSchema),
  alternate: z.array(ExternalExecutionSchema),
  decoy: ExternalExecutionSchema,
});
export type ExternalMatrix = z.infer<typeof ExternalMatrixSchema>;
