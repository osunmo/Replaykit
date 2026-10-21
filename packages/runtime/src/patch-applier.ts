import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  QS33_BASE_COMMIT,
  QS33_SOURCE_FILES,
} from './adapters/qs33-adapter.js';

export const ALLOWED_PATCH_PATHS = [
  'lib/parse.js',
  'lib/stringify.js',
  'lib/utils.js',
] as const;

export type AllowedPatchPath = (typeof ALLOWED_PATCH_PATHS)[number];

export const sha256 = (b: Buffer | string): string =>
  createHash('sha256').update(b).digest('hex');

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

export interface FilePatch {
  oldPath: string;
  newPath: string;
  hunks: Hunk[];
}

export interface ApplyPatchOptions {
  stagingDir: string;
  patch: string;
  expectedPatchHash: string;
  baseCommit?: string;
  expectedBaseCommit?: string;
  allowlist?: readonly string[];
  sourceFiles?: readonly string[];
}

export interface PatchApplicationResult {
  applied: boolean;
  patchHash: string;
  changedFiles: string[];
  sourceHashes: Record<string, string>;
}

/**
 * Validates file path for path traversal, absolute paths, and allowlist.
 */
export function validatePatchPath(
  rawPath: string,
  allowlist: readonly string[] = ALLOWED_PATCH_PATHS,
): string {
  // Reject absolute paths
  if (
    rawPath.startsWith('/') ||
    rawPath.startsWith('\\') ||
    /^[A-Za-z]:/.test(rawPath)
  ) {
    throw new Error(
      `ABSOLUTE_PATH_DETECTED: Absolute paths are forbidden in candidate patches: ${rawPath}`,
    );
  }

  // Reject path traversal tokens
  if (
    rawPath.includes('..') ||
    rawPath.startsWith('../') ||
    rawPath.startsWith('..\\') ||
    rawPath.includes('/../') ||
    rawPath.includes('\\..\\')
  ) {
    throw new Error(
      `PATH_TRAVERSAL_DETECTED: Path traversal is forbidden in candidate patches: ${rawPath}`,
    );
  }

  // Reject null bytes
  if (rawPath.includes('\0')) {
    throw new Error(
      `PATH_TRAVERSAL_DETECTED: Null byte detected in path: ${rawPath}`,
    );
  }

  // Strip leading a/ or b/
  const stripped = rawPath.replace(/^[ab]\//, '');
  const normalized = path.posix.normalize(stripped);

  if (normalized.startsWith('../') || normalized === '..') {
    throw new Error(
      `PATH_TRAVERSAL_DETECTED: Path traversal is forbidden: ${rawPath}`,
    );
  }

  // Check allowlist
  if (!allowlist.includes(normalized)) {
    throw new Error(
      `UNAUTHORIZED_MODIFIED_FILE: Patch modifies unauthorized path '${normalized}'. Allowed paths: ${allowlist.join(', ')}`,
    );
  }

  return normalized;
}

/**
 * Parses a unified git diff into structured file patches with strict syntax and path validation.
 */
export function parseUnifiedDiff(
  patchText: string,
  allowlist: readonly string[] = ALLOWED_PATCH_PATHS,
): FilePatch[] {
  if (!patchText || typeof patchText !== 'string' || !patchText.trim()) {
    throw new Error('INVALID_PATCH_SYNTAX: patch is empty or not a string');
  }

  const normalizedText = patchText.replace(/\r\n/g, '\n');
  const lines = normalizedText.split('\n');
  const filePatches: FilePatch[] = [];
  let currentFile: FilePatch | null = null;
  let currentHunk: Hunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('diff --git ')) {
      const match = /^diff --git\s+(\S+)\s+(\S+)$/.exec(line);
      if (!match) {
        throw new Error(
          `INVALID_PATCH_SYNTAX: malformed 'diff --git' header: ${line}`,
        );
      }
      const oldRaw = match[1]!;
      const newRaw = match[2]!;

      const oldPath = validatePatchPath(oldRaw, allowlist);
      const newPath = validatePatchPath(newRaw, allowlist);

      currentFile = { oldPath, newPath, hunks: [] };
      filePatches.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (line.startsWith('--- ')) {
      const raw = line.slice(4).trim().split(/\s+/)[0]!;
      validatePatchPath(raw, allowlist);
      continue;
    }

    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim().split(/\s+/)[0]!;
      validatePatchPath(raw, allowlist);
      continue;
    }

    if (line.startsWith('index ')) {
      // index header e.g. "index 89feef3..ab6d659 100755"
      continue;
    }

    if (line.startsWith('@@ ')) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) {
        throw new Error(
          `INVALID_PATCH_SYNTAX: malformed hunk header: ${line}`,
        );
      }
      if (!currentFile) {
        throw new Error('INVALID_PATCH_SYNTAX: hunk declared before file header');
      }
      currentHunk = {
        oldStart: parseInt(match[1]!, 10),
        oldLines: match[2] !== undefined ? parseInt(match[2]!, 10) : 1,
        newStart: parseInt(match[3]!, 10),
        newLines: match[4] !== undefined ? parseInt(match[4]!, 10) : 1,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (currentHunk) {
      if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
        currentHunk.lines.push(line);
      } else if (line.startsWith('\\ No newline')) {
        // Ignored metadata
      } else if (line.trim() === '' && i === lines.length - 1) {
        // Trailing empty line at EOF
      } else if (line === '') {
        currentHunk.lines.push(' ');
      } else {
        throw new Error(
          `INVALID_PATCH_SYNTAX: unrecognized hunk line at line ${i + 1}: ${line}`,
        );
      }
    }
  }

  if (filePatches.length === 0) {
    throw new Error('INVALID_PATCH_SYNTAX: patch contains no diff files');
  }

  for (const fp of filePatches) {
    if (fp.hunks.length === 0) {
      throw new Error(
        `INVALID_PATCH_SYNTAX: file ${fp.newPath} has no hunks`,
      );
    }
  }

  return filePatches;
}

/**
 * Applies hunks to a string content in pure TypeScript without executing shell hooks.
 */
export function applyHunksToContent(fileContent: string, hunks: Hunk[]): string {
  const eol = fileContent.includes('\r\n') ? '\r\n' : '\n';
  const hadTrailingNewline = fileContent.endsWith('\n');
  const lines = fileContent.split(/\r?\n/);
  if (hadTrailingNewline && lines[lines.length - 1] === '') {
    lines.pop();
  }

  let offset = 0;
  for (const hunk of hunks) {
    const expectedOld = hunk.lines
      .filter((l) => l.startsWith(' ') || l.startsWith('-'))
      .map((l) => l.slice(1));
    const newLines = hunk.lines
      .filter((l) => l.startsWith(' ') || l.startsWith('+'))
      .map((l) => l.slice(1));

    const baseLine = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
    const startIdx = Math.max(0, baseLine + offset);
    const actualOld = lines.slice(startIdx, startIdx + expectedOld.length);

    if (actualOld.join('\n') !== expectedOld.join('\n')) {
      throw new Error(
        `PATCH_APPLICATION_FAILED: context mismatch at line ${hunk.oldStart}. Expected '${expectedOld[0] ?? ''}', found '${actualOld[0] ?? ''}'`,
      );
    }

    lines.splice(startIdx, expectedOld.length, ...newLines);
    offset += newLines.length - expectedOld.length;
  }

  return lines.join(eol) + (hadTrailingNewline ? eol : '');
}

/**
 * Applies a candidate patch securely to a staging directory.
 *
 * Enforces:
 * 1. Base commit validation.
 * 2. SHA-256 patch digest verification.
 * 3. Symlink rejection.
 * 4. Strict path allowlist (rejection of test/, package.json, path traversal, absolute paths).
 * 5. Execution without shell hooks.
 * 6. Post-application change inspection and source hash computation.
 */
export async function applyCandidatePatch(
  options: ApplyPatchOptions,
): Promise<PatchApplicationResult> {
  const { stagingDir, patch, expectedPatchHash } = options;
  const expectedBase = options.expectedBaseCommit ?? QS33_BASE_COMMIT;
  const allowlist = options.allowlist ?? ALLOWED_PATCH_PATHS;

  // 1. Enforce base commit revision
  if (options.baseCommit && options.baseCommit !== expectedBase) {
    throw new Error(
      `INCORRECT_BASE_COMMIT: expected ${expectedBase}, got ${options.baseCommit}`,
    );
  }

  // Check if .git/HEAD exists in stagingDir to verify on-disk base commit
  try {
    const gitHeadPath = path.join(stagingDir, '.git', 'HEAD');
    let headContent = (await readFile(gitHeadPath, 'utf8')).trim();
    if (headContent.startsWith('ref:')) {
      const refPath = headContent.slice(4).trim();
      const resolvedRef = path.join(stagingDir, '.git', ...refPath.split('/'));
      try {
        headContent = (await readFile(resolvedRef, 'utf8')).trim();
      } catch {
        // Symbolic ref target may not exist in shallow copy
      }
    }
    if (headContent && !headContent.startsWith('ref:') && headContent !== expectedBase) {
      throw new Error(
        `INCORRECT_BASE_COMMIT: on-disk git commit is ${headContent}, expected ${expectedBase}`,
      );
    }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.startsWith('INCORRECT_BASE_COMMIT')
    ) {
      throw err;
    }
    // .git/HEAD may not exist if staged without git metadata
  }

  // 2. Enforce expected patch SHA-256
  const normalizedPatch = patch.replace(/\r\n/g, '\n');
  const actualPatchHash = sha256(normalizedPatch);
  if (actualPatchHash !== expectedPatchHash) {
    throw new Error(
      `TAMPERED_PATCH_HASH: expected ${expectedPatchHash}, got ${actualPatchHash}`,
    );
  }

  // 3. Symlink inspection: Ensure staging dir and target files are not symlinks
  const stagingStat = await lstat(stagingDir);
  if (stagingStat.isSymbolicLink()) {
    throw new Error(`SYMLINK_FORBIDDEN: stagingDir is a symbolic link: ${stagingDir}`);
  }

  for (const relPath of allowlist) {
    const targetPath = path.join(stagingDir, ...relPath.split('/'));
    try {
      const fileStat = await lstat(targetPath);
      if (fileStat.isSymbolicLink()) {
        throw new Error(
          `SYMLINK_FORBIDDEN: target file is a symbolic link: ${relPath}`,
        );
      }
    } catch {
      // File may not exist yet
    }
  }

  // 4. Parse unified diff and validate paths & syntax
  const filePatches = parseUnifiedDiff(normalizedPatch, allowlist);

  const trackedFiles = options.sourceFiles ?? (options.allowlist ? Array.from(new Set([...options.allowlist])) : QS33_SOURCE_FILES);

  // Record initial hashes of tracked source files before applying
  const beforeHashes: Record<string, string> = {};
  for (const file of trackedFiles) {
    const filePath = path.join(stagingDir, ...file.split('/'));
    try {
      const content = await readFile(filePath);
      beforeHashes[file] = sha256(content);
    } catch {
      beforeHashes[file] = '';
    }
  }

  // 5. Apply hunks securely in-memory and write back
  for (const fp of filePatches) {
    const filePath = path.join(stagingDir, ...fp.newPath.split('/'));
    const content = await readFile(filePath, 'utf8');
    const patchedContent = applyHunksToContent(content, fp.hunks);
    await writeFile(filePath, patchedContent, 'utf8');
  }

  // 6. Post-application inspection: compute actual changes and verify allowlist
  const afterHashes: Record<string, string> = {};
  const changedFiles: string[] = [];

  for (const file of trackedFiles) {
    const filePath = path.join(stagingDir, ...file.split('/'));
    const content = await readFile(filePath);
    const hashVal = sha256(content);
    afterHashes[file] = hashVal;
    if (hashVal !== beforeHashes[file]) {
      changedFiles.push(file);
    }
  }

  // Verify that changes occurred and strictly conform to allowlist
  if (changedFiles.length === 0) {
    throw new Error('NO_FILES_MODIFIED: patch resulted in 0 changed files');
  }

  for (const changed of changedFiles) {
    if (!allowlist.includes(changed as any)) {
      throw new Error(
        `UNAUTHORIZED_MODIFIED_FILE: post-application verification failed: ${changed} was modified`,
      );
    }
  }

  return {
    applied: true,
    patchHash: actualPatchHash,
    changedFiles,
    sourceHashes: afterHashes,
  };
}
