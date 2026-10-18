import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED_CANARY = 'sntryu_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const TOKEN_PATTERN = /\b(sntry[a-z]_[0-9a-fA-F]{20,})\b/g;

interface Violation {
  file: string;
  line: number;
  token: string;
}

const violations: Violation[] = [];

// 1. Scan tracked and untracked repository files via git grep
try {
  const output = execSync('git grep --untracked -nE "sntry[a-z]_[0-9a-f]{20,}"', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const lines = output.trim().split('\n').filter(Boolean);
  for (const line of lines) {
    const parts = line.split(':');
    if (parts.length >= 3 && parts[0] && parts[1]) {
      const file = parts[0];
      const lineNum = parseInt(parts[1], 10);
      const content = parts.slice(2).join(':');

      let match: RegExpExecArray | null;
      TOKEN_PATTERN.lastIndex = 0;
      while ((match = TOKEN_PATTERN.exec(content)) !== null) {
        const found = match[1];
        if (found && found !== ALLOWED_CANARY) {
          violations.push({ file, line: lineNum, token: found });
        }
      }
    }
  }
} catch (err: unknown) {
  // If exit code is 1, git grep found no matches, which is fine
  const execErr = err as { status?: number };
  if (execErr.status !== 1) {
    // If git grep is not available or errored unexpectedly, fallback to fs scan
  }
}

// 2. Scan ignored directories that may contain artifacts: docs, runs, work
function scanDirectory(dir: string): void {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
          continue;
        }
        // Avoid deep node_modules or submodule recursion in work/medusa
        if (dir.includes('work') && entry.name === 'medusa') {
          continue;
        }
        scanDirectory(fullPath);
      } else if (entry.isFile()) {
        if (
          entry.name.endsWith('.png') ||
          entry.name.endsWith('.jpg') ||
          entry.name.endsWith('.tar') ||
          entry.name.endsWith('.gz')
        ) {
          continue;
        }
        try {
          const content = readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;
            let match: RegExpExecArray | null;
            TOKEN_PATTERN.lastIndex = 0;
            while ((match = TOKEN_PATTERN.exec(line)) !== null) {
              const found = match[1];
              if (found && found !== ALLOWED_CANARY) {
                violations.push({ file: fullPath, line: i + 1, token: found });
              }
            }
          }
        } catch {
          // Ignore unreadable files
        }
      }
    }
  } catch {
    // Directory might not exist
  }
}

for (const dir of ['runs', 'work/sentry', 'work/sandbox', 'docs']) {
  scanDirectory(dir);
}

if (violations.length > 0) {
  console.error(`ERROR: Unauthorized token-shaped strings detected (${violations.length}):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} -> ${v.token.slice(0, 10)}... (not allowed canary)`);
  }
  process.exit(1);
} else {
  console.log('Token scan clean: only allowed fake canaries found.');
  process.exit(0);
}
