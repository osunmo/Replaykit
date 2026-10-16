import path from 'node:path';

export function relativeArtifactPath(root: string, file: string): string {
  const paths = /^[a-z]:[\\/]/i.test(root) ? path.win32 : path.posix;
  const relative = paths.relative(root, file);
  if (paths.isAbsolute(relative))
    throw new Error('Artifact requires a relative path on the same volume');
  return relative.split(paths.sep).join('/');
}
