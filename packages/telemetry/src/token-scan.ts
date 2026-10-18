import { execFileSync } from 'node:child_process';
import { createReadStream, lstatSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

const canary = 'sntryu_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const tokenPattern = /sntry[a-z]_[0-9a-fA-F]{20,}/g;
export interface TokenScanResult {
  filesScanned: number;
  violations: { file: string; line: number }[];
}

/** Fail closed; findings contain locations only, never credential bytes. */
export async function scanRepository(directory: string): Promise<TokenScanResult> {
  const root = realpathSync(directory);
  let names: string[];
  try {
    const options = {
      cwd: root,
      encoding: 'utf8' as const,
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: 'pipe' as const,
    };
    const gitRoot = realpathSync(
      execFileSync('git', ['rev-parse', '--show-toplevel'], options).trim(),
    );
    if (gitRoot !== root) throw new Error('Not repository root');
    names = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      options,
    )
      .split('\0')
      .filter(Boolean);
  } catch {
    throw new Error('TOKEN_SCAN_GIT_FAILED');
  }
  const result: TokenScanResult = { filesScanned: 0, violations: [] };
  const visited = new Set<string>();
  const files: string[] = [];
  const checkedParents = new Set([root]);
  function inside(file: string): boolean {
    const offset = path.relative(root, file);
    return offset !== '..' && !offset.startsWith('..' + path.sep) && !path.isAbsolute(offset);
  }
  function checkParents(file: string): void {
    const parent = path.dirname(file);
    if (checkedParents.has(parent)) return;
    if (!inside(parent)) throw new Error('TOKEN_SCAN_UNSAFE_PATH');
    checkParents(parent);
    const stat = lstatSync(parent);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('TOKEN_SCAN_UNSAFE_PATH');
    checkedParents.add(parent);
  }
  function visit(
    file: string,
    knownKind?: { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean },
  ): void {
    file = path.resolve(file);
    if (!inside(file)) throw new Error('TOKEN_SCAN_UNSAFE_PATH');
    if (visited.has(file)) return;
    visited.add(file);
    let stat;
    try {
      if (!knownKind) checkParents(file);
      stat = knownKind ?? lstatSync(file);
    } catch {
      throw new Error('TOKEN_SCAN_UNREADABLE_PATH');
    }
    if (stat.isSymbolicLink()) throw new Error('TOKEN_SCAN_UNSAFE_PATH');
    if (stat.isDirectory()) {
      checkedParents.add(file);
      for (const entry of readdirSync(file, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        // Dependency trees and Git object stores are not repository artifacts.
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        visit(path.join(file, entry.name), entry);
      }
      return;
    }
    if (!stat.isFile()) throw new Error('TOKEN_SCAN_UNSUPPORTED_PATH');
    files.push(file);
  }
  for (const name of names) visit(path.join(root, name));
  const primaryFiles = new Set(files);
  const artifactRoots: string[] = [];
  for (const name of ['runs', 'work', 'docs']) {
    const target = path.join(root, name);
    try {
      lstatSync(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new Error('TOKEN_SCAN_UNREADABLE_PATH');
    }
    visit(target);
    artifactRoots.push(target);
  }
  const findings = new Set<string>();
  const newlines = (text: string) => text.split('\n').length - 1;
  async function scan(file: string): Promise<void> {
    let carry = '';
    let seenNewlines = 0;
    const name = path.relative(root, file).split(path.sep).join('/');
    function inspect(text: string, firstLine: number, eof: boolean): void {
      for (const match of text.matchAll(tokenPattern)) {
        // Defer an incomplete canary-sized suffix until the next chunk or EOF.
        if (
          !eof &&
          match.index + match[0].length === text.length &&
          match[0].length <= canary.length
        )
          continue;
        if (match[0] !== canary) {
          const line = firstLine + newlines(text.slice(0, match.index));
          const key = JSON.stringify([name, line]);
          if (!findings.has(key)) {
            findings.add(key);
            result.violations.push({ file: name.replace(tokenPattern, '[REDACTED_TOKEN]'), line });
          }
        }
      }
    }
    try {
      for await (const bytes of createReadStream(file, { highWaterMark: 65536 })) {
        const chunk = (bytes as Buffer).toString('latin1');
        const text = carry + chunk;
        inspect(text, seenNewlines - newlines(carry) + 1, false);
        seenNewlines += newlines(chunk);
        carry = text.slice(-128);
      }
      inspect(carry, seenNewlines - newlines(carry) + 1, true);
      result.filesScanned++;
    } catch {
      throw new Error('TOKEN_SCAN_UNREADABLE_PATH');
    }
  }
  let accelerated = false;
  if (artifactRoots.length) {
    let output: string | undefined;
    try {
      output = execFileSync(
        'rg',
        [
          '--no-config',
          '--encoding',
          'none',
          '--json',
          '--text',
          '--hidden',
          '--no-ignore',
          '-g',
          '!**/node_modules/**',
          '-g',
          '!**/.git/**',
          '-e',
          tokenPattern.source,
          '--',
          ...artifactRoots,
        ],
        { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, stdio: 'pipe' },
      );
    } catch (error) {
      const failure = error as { code?: string; status?: number };
      if (failure.code === 'ENOENT') output = undefined;
      else if (failure.status === 1) output = '';
      else throw new Error('TOKEN_SCAN_SEARCH_FAILED');
    }
    if (output !== undefined) {
      accelerated = true;
      try {
        for (const line of output.split('\n').filter(Boolean)) {
          const row = JSON.parse(line) as {
            type: string;
            data: {
              path?: { text?: string };
              line_number?: number;
              submatches?: { match: { text?: string } }[];
            };
          };
          if (row.type !== 'match') continue;
          const name = row.data.path?.text;
          const number = row.data.line_number;
          if (!name || !Number.isInteger(number) || !Array.isArray(row.data.submatches))
            throw new Error('Malformed search result');
          for (const match of row.data.submatches) {
            if (!match.match.text) throw new Error('Malformed search match');
            if (match.match.text === canary) continue;
            const relative = path.relative(root, name).split(path.sep).join('/');
            const key = JSON.stringify([relative, number]);
            if (!findings.has(key)) {
              findings.add(key);
              result.violations.push({
                file: relative.replace(tokenPattern, '[REDACTED_TOKEN]'),
                line: number!,
              });
            }
          }
        }
      } catch {
        throw new Error('TOKEN_SCAN_SEARCH_REPORT_INVALID');
      }
    }
  }
  const pending = accelerated ? [...primaryFiles] : files;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, pending.length) }, async () => {
    while (cursor < pending.length) await scan(pending[cursor++]!);
  });
  const completed = await Promise.allSettled(workers);
  if (completed.some((worker) => worker.status === 'rejected'))
    throw new Error('TOKEN_SCAN_UNREADABLE_PATH');
  if (accelerated) result.filesScanned += files.length - primaryFiles.size;
  result.violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return result;
}
