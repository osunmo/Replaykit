import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { SandboxManifest } from '../../judge/src/sandbox.js';
import { collectProvenance, RunProvenanceSchema } from './provenance.js';

const run = promisify(execFile);
const roots: string[] = [];
const hash = 'a'.repeat(64);
const image = `sha256:${hash}`;
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'replaykit-provenance-'));
  roots.push(root);
  for (const file of [
    'packages/cli/src/workflow.ts',
    'packages/runtime/src/index.ts',
    'packages/contracts/src/index.ts',
    'packages/telemetry/src/index.ts',
    'packages/judge/src/evaluate.ts',
    'docker/replay-fixture.mjs',
    'scripts/build-sandbox.ts',
    'pnpm-lock.yaml',
  ]) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), `${file}\n`);
  }
  const lockfileHash = createHash('sha256')
    .update(await readFile(path.join(root, 'pnpm-lock.yaml')))
    .digest('hex');
  const manifest: SandboxManifest = {
    schemaVersion: 1,
    nodeImage: image,
    postgresImage: image,
    candidateImage: image,
    plannerImage: image,
    appImages: { buggy: image, reference: image, alternate: image, decoy: image },
    sourceHashes: { buggy: hash, reference: hash, alternate: hash, decoy: hash },
    applicationSourceHash: hash,
    buildLockfileHash: lockfileHash,
    sdkSourceHash: hash,
    plannerSourceHash: hash,
    postgresRuntime: { mode: 'initdb', fsync: 'on', baseImage: image },
    builtAt: new Date().toISOString(),
  };
  return { root, manifest, lockfileHash };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.join(os.tmpdir(), 'replaykit-provenance-')))
      throw new Error('Unexpected cleanup directory');
    await rm(root, { recursive: true, force: true });
  }
});

describe('future run provenance', () => {
  it('records validated source, image, dependency and runtime identities without inventing Git data for an archive', async () => {
    const { root, manifest, lockfileHash } = await setup();
    const provenance = await collectProvenance(root, manifest, 3);
    expect(RunProvenanceSchema.parse(provenance)).toEqual(provenance);
    expect(provenance).toMatchObject({
      schemaVersion: 1,
      applicationSourceHash: hash,
      lockfileHash,
      git: { status: 'UNAVAILABLE', commit: null, dirty: null },
      runtime: { postgresMode: 'initdb', concurrency: 3, fsync: 'on' },
      images: { candidateImage: image, appImages: manifest.appImages },
    });
    expect(provenance.controllerSourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(provenance.judgeSourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(provenance)).not.toContain(root);
  });

  it('changes controller and judge hashes for changes in their actual sources and shared contracts', async () => {
    const { root, manifest } = await setup();
    const original = await collectProvenance(root, manifest, 1);
    await writeFile(path.join(root, 'packages/runtime/src/index.ts'), 'runtime changed');
    const runtime = await collectProvenance(root, manifest, 1);
    expect(runtime.controllerSourceHash).not.toBe(original.controllerSourceHash);
    expect(runtime.judgeSourceHash).toBe(original.judgeSourceHash);
    await writeFile(path.join(root, 'packages/judge/src/evaluate.ts'), 'judge changed');
    const judge = await collectProvenance(root, manifest, 1);
    expect(judge.judgeSourceHash).not.toBe(runtime.judgeSourceHash);
    await writeFile(path.join(root, 'packages/contracts/src/index.ts'), 'contract changed');
    const contracts = await collectProvenance(root, manifest, 1);
    expect(contracts.controllerSourceHash).not.toBe(judge.controllerSourceHash);
    expect(contracts.judgeSourceHash).not.toBe(judge.judgeSourceHash);
  });

  it('records the current Git commit and dirty state including untracked source', async () => {
    const { root, manifest } = await setup();
    await run('git', ['init', '--quiet', root]);
    await run('git', ['-C', root, 'add', '.']);
    await run('git', [
      '-C',
      root,
      '-c',
      'user.name=ReplayKit Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ]);
    const clean = await collectProvenance(root, manifest, 3);
    expect(clean.git).toMatchObject({ status: 'AVAILABLE', dirty: false });
    expect(clean.git.commit).toMatch(/^[a-f0-9]{40}$/);
    await writeFile(path.join(root, 'packages/cli/src/untracked.ts'), 'new source');
    const dirty = await collectProvenance(root, manifest, 3);
    expect(dirty.git).toEqual({ ...clean.git, dirty: true });
  });

  it('requires a rebuild for historical manifests and changed dependencies', async () => {
    const { root, manifest } = await setup();
    const legacy = { ...manifest };
    delete legacy.applicationSourceHash;
    await expect(collectProvenance(root, legacy, 3)).rejects.toThrow('PROVENANCE_REBUILD_REQUIRED');
    await writeFile(path.join(root, 'pnpm-lock.yaml'), 'new dependencies');
    await expect(collectProvenance(root, manifest, 3)).rejects.toThrow(
      'PROVENANCE_LOCKFILE_MISMATCH',
    );
  });

  it('rejects unsupported runtime settings and malformed required provenance', async () => {
    const { root, manifest } = await setup();
    await expect(collectProvenance(root, manifest, 6)).rejects.toThrow();
    await expect(
      collectProvenance(
        root,
        { ...manifest, postgresRuntime: { mode: 'template-copy', baseImage: image, fsync: 'on' } },
        3,
      ),
    ).rejects.toThrow();
    const provenance = await collectProvenance(root, manifest, 3);
    for (const field of [
      'applicationSourceHash',
      'controllerSourceHash',
      'judgeSourceHash',
      'lockfileHash',
    ] as const) {
      expect(RunProvenanceSchema.safeParse({ ...provenance, [field]: 'invalid' }).success).toBe(
        false,
      );
    }
    expect(
      RunProvenanceSchema.safeParse({
        ...provenance,
        git: { status: 'AVAILABLE', commit: null, dirty: false },
      }).success,
    ).toBe(false);
    expect(
      RunProvenanceSchema.safeParse({
        ...provenance,
        runtime: { postgresMode: 'initdb', fsync: 'off', concurrency: 3 },
      }).success,
    ).toBe(false);
    expect(
      RunProvenanceSchema.safeParse({
        ...provenance,
        images: { ...provenance.images, candidateImage: 'mutable:latest' },
      }).success,
    ).toBe(false);
  });
});
