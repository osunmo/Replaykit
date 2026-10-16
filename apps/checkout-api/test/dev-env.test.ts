import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadDevelopmentEnvironment } from '../../../scripts/dev-env.js';

const directories: string[] = [];
async function directory() {
  const work = path.resolve('work');
  await mkdir(work, { recursive: true });
  const root = await mkdtemp(path.join(work, 'dev-env-test-'));
  directories.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('local development credentials', () => {
  it('creates persistent random credentials whose connection URL matches Compose', async () => {
    const root = await directory();
    const env = await loadDevelopmentEnvironment(root);
    expect(env.POSTGRES_PASSWORD).toMatch(/^[a-f0-9]{64}$/);
    const url = new URL(env.DATABASE_URL!);
    expect(url.hostname).toBe('127.0.0.1');
    expect(url.port).toBe('55432');
    expect(url.pathname).toBe('/replaykit');
    expect(url.username).toBe('replaykit');
    expect(decodeURIComponent(url.password)).toBe(env.POSTGRES_PASSWORD);
    expect(env.REPLAYKIT_DEV_VOLUME).toMatch(/^[a-f0-9]{16}$/);
    expect(await readFile(path.join(root, '.env'), 'utf8')).toContain(env.POSTGRES_PASSWORD);
    expect(await loadDevelopmentEnvironment(root)).toEqual(env);
  });

  it('does not reuse credentials or volumes between independent checkouts', async () => {
    const first = await loadDevelopmentEnvironment(await directory());
    const second = await loadDevelopmentEnvironment(await directory());
    expect(first.POSTGRES_PASSWORD).not.toBe(second.POSTGRES_PASSWORD);
    expect(first.REPLAYKIT_DEV_VOLUME).not.toBe(second.REPLAYKIT_DEV_VOLUME);
  });

  it('preserves existing configuration and rejects a mismatched connection without leaking it', async () => {
    const root = await directory();
    const contents = [
      'POSTGRES_PASSWORD=private-test-password',
      'DATABASE_URL=postgres://replaykit:wrong@127.0.0.1:55432/replaykit',
      'REPLAYKIT_DEV_VOLUME=preserved',
      '',
    ].join('\n');
    await writeFile(path.join(root, '.env'), contents);
    await expect(loadDevelopmentEnvironment(root)).rejects.toThrow(
      'Invalid local development configuration',
    );
    expect(await readFile(path.join(root, '.env'), 'utf8')).toBe(contents);
  });

  it('loads only the local database configuration, leaving unrelated environment keys out', async () => {
    const root = await directory();
    await writeFile(
      path.join(root, '.env'),
      [
        'POSTGRES_PASSWORD=private-test-password',
        'DATABASE_URL=postgres://replaykit:private-test-password@127.0.0.1:55432/replaykit',
        'REPLAYKIT_DEV_VOLUME=preserved',
        'NODE_OPTIONS=--inspect',
        '',
      ].join('\n'),
    );
    const env = await loadDevelopmentEnvironment(root);
    expect(env.POSTGRES_PASSWORD).toBe('private-test-password');
    expect(env.REPLAYKIT_DEV_VOLUME).toBe('preserved');
    expect(env.NODE_OPTIONS).toBeUndefined();
  });

  it('rejects an existing directory where a local environment file is expected', async () => {
    const root = await directory();
    await mkdir(path.join(root, '.env'));
    await expect(loadDevelopmentEnvironment(root)).rejects.toThrow(
      'Local .env must be a regular file',
    );
  });
});
