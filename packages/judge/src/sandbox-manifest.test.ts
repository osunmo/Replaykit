import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadManifest } from './sandbox.js';

const temporaryParent = path.resolve(tmpdir());
const prefix = 'replaykit-manifest-';
const image = `sha256:${'a'.repeat(64)}`;
const hash = 'b'.repeat(64);
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(temporaryParent, prefix));
  await mkdir(path.join(root, 'work/sandbox'), { recursive: true });
});

afterEach(async () => {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== temporaryParent || !path.basename(resolved).startsWith(prefix))
    throw new Error('Refusing to remove an unexpected test directory');
  await rm(resolved, { recursive: true, force: true });
});

async function saveManifest(postgresRuntime?: {
  mode: 'initdb' | 'template-copy';
  fsync: 'on' | 'off';
}) {
  await writeFile(
    path.join(root, 'work/sandbox/manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      nodeImage: image,
      postgresImage: image,
      candidateImage: image,
      plannerImage: image,
      appImages: { buggy: image, reference: image, alternate: image, decoy: image },
      sourceHashes: { buggy: hash, reference: hash, alternate: hash, decoy: hash },
      ...(postgresRuntime ? { postgresRuntime: { ...postgresRuntime, baseImage: image } } : {}),
      builtAt: '2026-10-16T00:00:00.000Z',
    }),
  );
}

describe('sandbox manifest PostgreSQL runtime settings', () => {
  it('rejects fsync off for the stock image instead of recording an ignored setting', async () => {
    await saveManifest({ mode: 'initdb', fsync: 'off' });
    await expect(loadManifest(root)).rejects.toThrow(/fsync/);
  });

  it.each([
    { mode: 'initdb', fsync: 'on' },
    { mode: 'template-copy', fsync: 'on' },
    { mode: 'template-copy', fsync: 'off' },
  ] as const)('loads supported $mode / fsync $fsync settings', async (settings) => {
    await saveManifest(settings);
    const manifest = await loadManifest(root);
    expect(manifest.postgresRuntime).toEqual({ ...settings, baseImage: image });
  });

  it('loads legacy manifests that omit PostgreSQL runtime metadata', async () => {
    await saveManifest();
    const manifest = await loadManifest(root);
    expect(manifest.postgresRuntime).toBeUndefined();
    expect(manifest.postgresImage).toBe(image);
  });
});
