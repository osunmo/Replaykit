import { z } from 'zod';
import { IncidentSchema, JudgeResultSchema } from '../../contracts/src/index.js';

export const RunIdSchema = z.uuid();
export const StartRequestSchema = z.union([
  z.strictObject({
    fixture: z.literal('R1'),
    concurrency: z.number().int().min(1).max(3).default(3),
  }),
  z.strictObject({
    incident: IncidentSchema,
    concurrency: z.number().int().min(1).max(3).default(3),
  }),
]);
export type StartRequest = z.input<typeof StartRequestSchema>;
export const ProgressSchema = z.strictObject({
  phase: z.enum(['QUEUED', 'CAPTURING', 'PLANNING', 'VERIFYING', 'FINISHED']),
  completedExecutions: z.number().int().min(0).max(17),
  totalExecutions: z.literal(17),
  preliminary: z.boolean(),
});
export const JobSchema = z.strictObject({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  state: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'INTERRUPTED']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  heartbeatAt: z.iso.datetime(),
  concurrency: z.number().int().min(1).max(3),
  ownerToken: z.string().regex(/^[a-f0-9]{64}$/),
  progress: ProgressSchema,
  verdict: JudgeResultSchema.shape.status.nullable(),
  reasonCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .nullable(),
  cancelRequested: z.boolean(),
});
export type StoredJob = z.infer<typeof JobSchema>;
export type JobStatus = Omit<StoredJob, 'ownerToken' | 'heartbeatAt'>;
export interface ManagedArtifact {
  runId: string;
  artifact: string;
  content: string;
}
export class RuntimeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RuntimeError';
  }
}
export const terminal = (state: StoredJob['state']) => state !== 'QUEUED' && state !== 'RUNNING';
