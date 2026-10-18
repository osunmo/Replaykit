import { execFileSync, spawnSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const script = path.resolve(import.meta.dirname, '../../../scripts/token-scan.ts');
const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
function removeTemporary(parent: string): void {
  if (
    path.dirname(realpathSync(parent)) !== realpathSync(tmpdir()) ||
    lstatSync(parent).isSymbolicLink()
  ) {
    throw new Error('Unsafe temporary cleanup');
  }
  rmSync(parent, { recursive: true });
}
function probe(setup: (root: string, outside: string) => void | NodeJS.ProcessEnv, git = true) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'replaykit-token-scan-')));
  const root = path.join(parent, 'repo');
  mkdirSync(root);
  try {
    if (git) execFileSync('git', ['init', '-q', root]);
    const environment = setup(root, parent);
    const result = spawnSync(process.execPath, ['--import', loader, script], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, ...environment },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    removeTemporary(parent);
  }
}
const unauthorized = (hex: string) => 'sntry' + 'u_' + hex.repeat(64);
describe('repository token scan CLI', () => {
  it('allows only the exact fake canary', () => {
    const r = probe((root) =>
      writeFileSync(path.join(root, 'fixture.txt'), 'sntryu_' + 'deadbeef'.repeat(8)),
    );
    expect(r.status).toBe(0);
  });
  it.each(['a', 'A'])('rejects untracked %s hex tokens without printing token bytes', (hex) => {
    const value = unauthorized(hex);
    const r = probe((root) => writeFileSync(path.join(root, 'fixture.txt'), value));
    expect(r.status).toBe(1);
    expect(r.output).not.toContain(value);
    expect(r.output).not.toContain(value.slice(0, 10));
  });
  it('rejects tracked tokens even when ignored by later ignore rules', () => {
    const r = probe((root) => {
      writeFileSync(path.join(root, 'fixture.txt'), unauthorized('b'));
      execFileSync('git', ['-C', root, 'add', 'fixture.txt']);
      writeFileSync(path.join(root, '.gitignore'), 'fixture.txt\n');
    });
    expect(r.status).toBe(1);
  });
  it('rejects token shapes in binary files', () => {
    const r = probe((root) =>
      writeFileSync(
        path.join(root, 'fixture.bin'),
        Buffer.concat([Buffer.from([0]), Buffer.from(unauthorized('c')), Buffer.from([0])]),
      ),
    );
    expect(r.status).toBe(1);
  });
  it('rejects an extended canary instead of allowing a canary prefix', () => {
    const r = probe((root) =>
      writeFileSync(path.join(root, 'fixture.txt'), 'sntryu_' + 'deadbeef'.repeat(8) + 'aa'),
    );
    expect(r.status).toBe(1);
  });
  it('handles a permitted canary crossing a stream boundary', () => {
    const r = probe((root) =>
      writeFileSync(
        path.join(root, 'boundary.txt'),
        'x'.repeat(65520) + 'sntryu_' + 'deadbeef'.repeat(8),
      ),
    );
    expect(r.status).toBe(0);
  });
  it('rejects a forbidden token crossing a stream boundary', () => {
    const r = probe((root) =>
      writeFileSync(path.join(root, 'boundary.txt'), 'x'.repeat(65520) + unauthorized('e')),
    );
    expect(r.status).toBe(1);
  });
  it.each(['work/project-name-independent', 'runs/ignored-case', 'docs/ignored-case'])(
    'scans ignored artifacts under %s',
    (dir) => {
      const r = probe((root) => {
        writeFileSync(path.join(root, '.gitignore'), 'work/\nruns/\ndocs/\n');
        mkdirSync(path.join(root, dir), { recursive: true });
        writeFileSync(path.join(root, dir, 'fixture.txt'), unauthorized('d'));
      });
      expect(r.status).toBe(1);
    },
  );
  it('fails closed when Git cannot enumerate a repository', () => {
    expect(probe(() => {}, false).status).toBe(1);
  });
  it('ignores user ripgrep configuration that would hide artifact files', () => {
    const r = probe((root, parent) => {
      writeFileSync(path.join(root, '.gitignore'), 'work/\n');
      mkdirSync(path.join(root, 'work'));
      writeFileSync(path.join(root, 'work', 'fixture.txt'), unauthorized('a'));
      const config = path.join(parent, 'rg-config');
      writeFileSync(config, '--glob=!*.txt\n');
      return { RIPGREP_CONFIG_PATH: config };
    });
    expect(r.status).toBe(1);
  });
  it('scans literal artifact bytes despite a UTF-16 byte-order mark', () => {
    const r = probe((root) => {
      writeFileSync(path.join(root, '.gitignore'), 'work/\n');
      mkdirSync(path.join(root, 'work'));
      writeFileSync(
        path.join(root, 'work', 'fixture.bin'),
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(unauthorized('b'))]),
      );
    });
    expect(r.status).toBe(1);
    expect(r.output).not.toContain(unauthorized('b'));
  });
  it('scans ignored binary artifact bytes with a secret-shaped filename', () => {
    const name = unauthorized('f');
    const r = probe((root) => {
      writeFileSync(path.join(root, '.gitignore'), 'work/\n');
      mkdirSync(path.join(root, 'work'));
      writeFileSync(
        path.join(root, 'work', name + '.bin'),
        Buffer.concat([Buffer.from([0]), Buffer.from(unauthorized('a'))]),
      );
    });
    expect(r.status).toBe(1);
    expect(r.output).not.toContain(name);
    expect(r.output).toContain('[REDACTED_TOKEN]');
  });
  it('does not disclose a token-shaped filename when reporting another token', () => {
    const name = unauthorized('f');
    const r = probe((root) => writeFileSync(path.join(root, name + '.txt'), unauthorized('a')));
    expect(r.status).toBe(1);
    expect(r.output).not.toContain(name);
  });
  it('rejects artifact symlink escapes without reading the target', () => {
    const r = probe((root, outside) => {
      writeFileSync(path.join(root, '.gitignore'), 'work/\n');
      mkdirSync(path.join(outside, 'outside'));
      mkdirSync(path.join(root, 'work'));
      symlinkSync(path.join(outside, 'outside'), path.join(root, 'work/escape'), 'junction');
    });
    expect(r.status).toBe(1);
  });
});
