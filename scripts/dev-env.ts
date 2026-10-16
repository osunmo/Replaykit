import { randomBytes } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

const invalidConfiguration = () =>
  new Error(
    'Invalid local development configuration in .env; preserve it and check the .env.example instructions',
  );

/** Credentials stay in the ignored local .env; only the required keys reach child processes. */
export async function loadDevelopmentEnvironment(root: string): Promise<Record<string, string>> {
  const file = path.join(root, '.env');
  let stat;
  try {
    stat = await lstat(file);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    const password = randomBytes(32).toString('hex');
    const volume = randomBytes(8).toString('hex');
    await writeFile(
      file,
      [
        '# Generated local development credentials. Do not commit this file.',
        `POSTGRES_PASSWORD=${password}`,
        `DATABASE_URL=postgres://replaykit:${password}@127.0.0.1:55432/replaykit`,
        `REPLAYKIT_DEV_VOLUME=${volume}`,
        '',
      ].join('\n'),
      { flag: 'wx', mode: 0o600 },
    );
    stat = await lstat(file);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384)
    throw new Error('Local .env must be a regular file no larger than 16 KiB');
  try {
    const values = parseEnv(await readFile(file, 'utf8'));
    const password = values.POSTGRES_PASSWORD;
    const connection = values.DATABASE_URL;
    const volume = values.REPLAYKIT_DEV_VOLUME;
    if (
      !password ||
      /[\r\n\0]/.test(password) ||
      !connection ||
      !volume ||
      !/^[a-z0-9][a-z0-9_-]{0,40}$/.test(volume)
    )
      throw invalidConfiguration();
    const target = new URL(connection);
    if (
      target.protocol !== 'postgres:' ||
      target.hostname !== '127.0.0.1' ||
      target.port !== '55432' ||
      target.pathname !== '/replaykit' ||
      target.username !== 'replaykit' ||
      decodeURIComponent(target.password) !== password ||
      target.search ||
      target.hash
    )
      throw invalidConfiguration();
    return { POSTGRES_PASSWORD: password, DATABASE_URL: connection, REPLAYKIT_DEV_VOLUME: volume };
  } catch {
    // Invalid input may contain credentials; never echo parser or URL error text.
    throw invalidConfiguration();
  }
}
