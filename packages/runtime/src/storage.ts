import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RuntimeError } from './contracts.js';

/** Trusted root plus individually validated components; no caller-supplied paths. */
export async function managedDirectory(
  root: string,
  components: readonly string[],
  create = false,
): Promise<string> {
  let current = await realpath(root);
  for (const component of components) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(component) || component.includes('..'))
      throw new RuntimeError('INVALID_MANAGED_PATH');
    current = path.join(current, component);
    if (create)
      await mkdir(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new RuntimeError('UNSAFE_MANAGED_PATH');
    const actual = await realpath(current);
    if (path.normalize(actual).toLowerCase() !== path.normalize(current).toLowerCase())
      throw new RuntimeError('UNSAFE_MANAGED_PATH');
  }
  return current;
}
export async function readManagedFile(
  directory: string,
  name: string,
  maxBytes = 1_048_576,
): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name) || name.includes('..'))
    throw new RuntimeError('INVALID_ARTIFACT');
  const file = path.join(directory, name);
  for (let attempt = 0; attempt < 3; attempt++) {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new RuntimeError('UNSAFE_ARTIFACT');
    if (stat.size > maxBytes) throw new RuntimeError('ARTIFACT_TOO_LARGE');
    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > maxBytes) throw new RuntimeError('UNSAFE_ARTIFACT');
      if (opened.ino !== stat.ino || opened.dev !== stat.dev) {
        if (attempt < 2) continue;
        throw new RuntimeError('UNSAFE_ARTIFACT');
      }
      const bytes = Buffer.alloc(maxBytes + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > maxBytes) throw new RuntimeError('ARTIFACT_TOO_LARGE');
      return bytes.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  }
  throw new RuntimeError('UNSAFE_ARTIFACT');
}
export async function atomicJson(directory: string, name: string, value: unknown): Promise<void> {
  const temporary = path.join(directory, `${name}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temporary, path.join(directory, name));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
export async function hasMarker(directory: string, name: string): Promise<boolean> {
  try {
    await readManagedFile(directory, name, 128);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
export async function createMarker(directory: string, name: string): Promise<void> {
  await writeFile(path.join(directory, name), 'requested\n', { flag: 'wx', mode: 0o600 }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error;
    },
  );
}
