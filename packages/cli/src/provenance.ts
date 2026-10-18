import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { SandboxManifest } from '../../judge/src/sandbox.js';

const execute = promisify(execFile);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const image = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const gitSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('AVAILABLE'),
      commit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
      dirty: z.boolean(),
    })
    .strict(),
  z.object({ status: z.literal('UNAVAILABLE'), commit: z.null(), dirty: z.null() }).strict(),
]);

/** Future records are complete and strict; older records are never backfilled. */
export const RunProvenanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    capturedAt: z.iso.datetime(),
    hashAlgorithm: z.literal('sha256'),
    applicationSourceHash: hash,
    controllerSourceHash: hash,
    judgeSourceHash: hash,
    sdkSourceHash: hash,
    plannerSourceHash: hash,
    lockfileHash: hash,
    git: gitSchema,
    runtime: z
      .object({
        postgresMode: z.literal('initdb'),
        concurrency: z.number().int().min(1).max(3),
        fsync: z.literal('on'),
      })
      .strict(),
    images: z
      .object({
        nodeImage: image,
        postgresImage: image,
        candidateImage: image,
        plannerImage: image,
        appImages: z
          .object({ buggy: image, reference: image, alternate: image, decoy: image })
          .strict(),
      })
      .strict(),
  })
  .strict();
export type RunProvenance = z.infer<typeof RunProvenanceSchema>;

async function gitState(root: string): Promise<RunProvenance['git']> {
  const unavailable = { status: 'UNAVAILABLE', commit: null, dirty: null } as const;
  try {
    // Do not attribute an extracted source archive to an unrelated ancestor repository.
    await lstat(path.join(root, '.git'));
    const options = { cwd: root, timeout: 5000, maxBuffer: 1_048_576, windowsHide: true };
    const commit = (await execute('git', ['rev-parse', '--verify', 'HEAD'], options)).stdout.trim();
    const status = await execute(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=normal'],
      options,
    );
    return gitSchema.parse({ status: 'AVAILABLE', commit, dirty: status.stdout.length > 0 });
  } catch {
    // An archive or an unavailable Git executable has no known commit/cleanliness.
    return unavailable;
  }
}

/** Hash exact file bytes and sorted repository-relative names, never file metadata. */
async function hashSources(root: string, inputs: readonly string[]): Promise<string> {
  const files: string[] = [];
  async function visit(name: string): Promise<void> {
    const file = path.join(root, name);
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) throw new Error('PROVENANCE_SYMLINK_REJECTED');
    if (stat.isDirectory()) {
      for (const entry of (await readdir(file)).sort()) await visit(`${name}/${entry}`);
    } else if (stat.isFile() && !/\.test\.[cm]?[jt]s$/.test(name)) {
      if (/\.(?:[cm]?[jt]s|json|sh)$/.test(name)) files.push(name);
    }
  }
  for (const input of inputs) {
    // Integrations absent from older source archives contribute as soon as present.
    try {
      await visit(input);
    } catch (error) {
      if (
        ['packages/runtime/src', 'packages/sentry/src', 'packages/mcp/src'].includes(input) &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      )
        continue;
      throw error;
    }
  }
  if (!files.length) throw new Error('PROVENANCE_SOURCES_UNAVAILABLE');
  const digest = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    digest.update(file).update('\0');
    digest.update(await readFile(path.join(root, file))).update('\0');
  }
  return digest.digest('hex');
}

export async function collectProvenance(
  root: string,
  manifest: SandboxManifest,
  concurrency: number,
): Promise<RunProvenance> {
  root = await realpath(root);
  if (
    !manifest.applicationSourceHash ||
    !manifest.buildLockfileHash ||
    !manifest.sdkSourceHash ||
    !manifest.plannerSourceHash
  )
    throw new Error('PROVENANCE_REBUILD_REQUIRED');
  const runtime = RunProvenanceSchema.shape.runtime.parse({
    postgresMode: manifest.postgresRuntime?.mode,
    fsync: manifest.postgresRuntime?.fsync,
    concurrency,
  });
  const lockfileHash = createHash('sha256')
    .update(await readFile(path.join(root, 'pnpm-lock.yaml')))
    .digest('hex');
  if (lockfileHash !== manifest.buildLockfileHash) throw new Error('PROVENANCE_LOCKFILE_MISMATCH');
  const [controllerSourceHash, judgeSourceHash, git] = await Promise.all([
    hashSources(root, [
      'packages/cli/src',
      'packages/runtime/src',
      'packages/sentry/src',
      'packages/mcp/src',
      'packages/contracts/src',
      'packages/telemetry/src',
      'scripts',
    ]),
    hashSources(root, [
      'packages/judge/src',
      'packages/contracts/src',
      'packages/telemetry/src',
      'docker/replay-fixture.mjs',
    ]),
    gitState(root),
  ]);
  return RunProvenanceSchema.parse({
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    hashAlgorithm: 'sha256',
    applicationSourceHash: manifest.applicationSourceHash,
    controllerSourceHash,
    judgeSourceHash,
    sdkSourceHash: manifest.sdkSourceHash,
    plannerSourceHash: manifest.plannerSourceHash,
    lockfileHash,
    git,
    runtime,
    images: {
      nodeImage: manifest.nodeImage,
      postgresImage: manifest.postgresImage,
      candidateImage: manifest.candidateImage,
      plannerImage: manifest.plannerImage,
      appImages: manifest.appImages,
    },
  });
}
