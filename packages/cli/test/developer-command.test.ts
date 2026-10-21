import { afterEach, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { developerCommand } from '../src/developer-command.js';
import { createFastifyPreset } from '../../runtime/src/adapters/generic-adapter.js';
import type { docker } from '../../judge/src/docker.js';

const tempDirs: string[] = [];
async function createTempRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'replaykit-dev-cli-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

describe('developerCommand: clean', () => {
  it('handles clean with --dry-run', async () => {
    const root = await createTempRoot();
    const mockDocker: typeof docker = vi.fn().mockImplementation(async (args: string[]) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('ps -a')) {
        return {
          code: 0,
          stdout:
            JSON.stringify({
              ID: 'c1',
              Names: 'rk-candidate-1',
              Labels: 'replaykit.run=run-1',
              State: 'exited',
              Status: 'Exited (0)',
            }) + '\n',
          stderr: '',
        };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const res = await developerCommand(root, ['clean', '--dry-run'], {}, mockDocker);
    expect(res).not.toBeNull();
    expect(res?.exitCode).toBe(0);
    const data = res?.data as Record<string, unknown>;
    expect(data.command).toBe('clean');
    expect(data.dryRun).toBe(true);
    expect(data.containersRemoved).toBe(1);
    expect(typeof data.durationMs).toBe('number');
    expect(Array.isArray(data.queries)).toBe(true);
  });

  it('reports failure when Docker command throws error', async () => {
    const root = await createTempRoot();
    const mockDocker: typeof docker = vi.fn().mockRejectedValue(new Error('Daemon not responding'));

    const res = await developerCommand(root, ['clean'], {}, mockDocker);
    expect(res?.exitCode).toBe(1);
    const failData = res?.data as { error: string; classification: string; durationMs: number | null };
    expect(failData.error).toBe('CLEAN_FAILED');
    expect(failData.classification).toBeDefined();
  });
});

describe('developerCommand: doctor', () => {
  it('reports healthy status when Docker is accessible', async () => {
    const root = await createTempRoot();
    const mockDocker: typeof docker = vi.fn().mockResolvedValue({
      code: 0,
      stdout: '"27.3.1"\n',
      stderr: '',
    });

    const res = await developerCommand(root, ['doctor'], {}, mockDocker);
    expect(res?.exitCode).toBe(0);
    const data = res?.data as { docker: { status: string; version: string }; overallStatus: string };
    expect(data.docker.status).toBe('CONNECTED');
    expect(data.docker.version).toBe('27.3.1');
  });

  it('reports unhealthy status when Docker is down', async () => {
    const root = await createTempRoot();
    const mockDocker: typeof docker = vi.fn().mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Cannot connect to the Docker daemon',
    });

    const res = await developerCommand(root, ['doctor'], {}, mockDocker);
    expect(res?.exitCode).toBe(1);
    const data = res?.data as { docker: { status: string }; overallStatus: string };
    expect(data.docker.status).toBe('ERROR');
    expect(data.overallStatus).toBe('UNHEALTHY');
  });
});

describe('developerCommand: generate', () => {
  it('requires --config flag', async () => {
    const root = await createTempRoot();
    const res = await developerCommand(root, ['generate'], {});
    expect(res?.exitCode).toBe(1);
    expect((res?.data as { error: string }).error).toBe('MISSING_FLAG');
  });

  it('honors --ambiguous-oracle with epistemic INSUFFICIENT_ORACLE status', async () => {
    const root = await createTempRoot();
    const res = await developerCommand(
      root,
      ['generate', '--config', 'fake-config.json', '--ambiguous-oracle'],
      {},
    );
    expect(res?.exitCode).toBe(2);
    expect((res?.data as { status: string }).status).toBe('INSUFFICIENT_ORACLE');
  });
});

describe('developerCommand: run & verify validation', () => {
  it('validates required flags for run', async () => {
    const root = await createTempRoot();
    const res = await developerCommand(root, ['run'], {});
    expect(res?.exitCode).toBe(1);
    expect((res?.data as { error: string }).error).toBe('MISSING_FLAG');
  });

  it('validates required flags for verify', async () => {
    const root = await createTempRoot();
    const res = await developerCommand(root, ['verify', '--config', 'cfg.json'], {});
    expect(res?.exitCode).toBe(1);
    expect((res?.data as { error: string }).error).toBe('MISSING_FLAGS');
  });

  it('returns null for unhandled non-developer commands', async () => {
    const root = await createTempRoot();
    const res = await developerCommand(root, ['incident', 'inspect', '--import-id', '123'], {});
    expect(res).toBeNull();
  });

  it('rejects duplicate flags with error', async () => {
    const root = await createTempRoot();
    const res = await developerCommand(
      root,
      ['clean', '--dry-run', '--dry-run'],
      {},
    );
    expect(res?.exitCode).toBe(1);
    expect((res?.data as { error: string }).error).toBe('INVALID_INPUT');
  });
});

describe('developerCommand: run execution logic', () => {
  it('executes run with valid configuration and reports passing outcome', async () => {
    const root = await createTempRoot();
    const cfgPath = path.join(root, 'fastify-config.json');
    const fastifyConfig = createFastifyPreset();
    await writeFile(cfgPath, JSON.stringify(fastifyConfig, null, 2), 'utf8');

    const testPath = path.join(root, 'repro.test.js');
    await writeFile(testPath, "console.log('baseline routing passed');", 'utf8');

    const mockSupervisor = vi.fn().mockResolvedValue({
      runId: 'cli-test-run',
      role: 'buggy',
      containerId: 'cnt-mock-1',
      exitCode: 0,
      executionStatus: 'COMPLETED',
      stdout: 'baseline routing passed\n',
      stderr: '',
      durationMs: 1200,
      artifacts: {},
      isolation: {
        networkMode: 'none',
        user: '1000:1000',
        readonlyRoot: true,
        capDropAll: true,
        noNewPrivileges: true,
        cpus: 1,
        memoryBytes: 256 * 1024 * 1024,
        pidsLimit: 64,
        mounts: [],
      },
      cleaned: true,
    });

    const res = await developerCommand(
      root,
      ['run', '--config', 'fastify-config.json', '--test', 'repro.test.js'],
      {},
      { invokeSupervisor: mockSupervisor },
    );

    expect(res).not.toBeNull();
    expect(res?.exitCode).toBe(0);
    const data = res?.data as { testPassed: boolean; normalizedExitCode: number };
    expect(data.testPassed).toBe(true);
    expect(data.normalizedExitCode).toBe(0);
  });
});

describe('developerCommand: verify differential evaluation', () => {
  it('returns VERIFIED when all differential targets fulfill expected invariants', async () => {
    const root = await createTempRoot();
    const cfgPath = path.join(root, 'config.json');
    const validPatch = [
      'diff --git a/lib/request.js b/lib/request.js',
      '--- a/lib/request.js',
      '+++ b/lib/request.js',
      '@@ -1,1 +1,1 @@',
      '-// stub source',
      '+// patched source',
      '',
    ].join('\n');
    const { createHash } = await import('node:crypto');
    const patchHash = createHash('sha256').update(validPatch).digest('hex');

    const fastifyConfig = createFastifyPreset({
      patchHashes: {
        buggy: '0000000000000000000000000000000000000000000000000000000000000000',
        reference: patchHash,
        alternate: patchHash,
        decoy: patchHash,
      },
    });
    await writeFile(cfgPath, JSON.stringify(fastifyConfig, null, 2), 'utf8');

    const testPath = path.join(root, 'repro.test.js');
    await writeFile(testPath, '// test source', 'utf8');

    const patchesDir = path.join(root, 'patches');
    await mkdir(patchesDir, { recursive: true });
    await writeFile(path.join(patchesDir, 'reference.patch'), validPatch, 'utf8');
    await writeFile(path.join(patchesDir, 'alternate.patch'), validPatch, 'utf8');
    await writeFile(path.join(patchesDir, 'decoy.patch'), validPatch, 'utf8');

    const mockSupervisor = vi.fn().mockImplementation(async (opts: { role: string }) => {
      if (opts.role === 'buggy') {
        return {
          runId: 'v-buggy',
          role: 'buggy',
          containerId: 'c-buggy',
          exitCode: 1,
          executionStatus: 'COMPLETED',
          stdout: '',
          stderr: "TypeError: Cannot read properties of undefined (reading 'config')\n    at Request.get (/case/lib/request.js:204:55)",
          durationMs: 1000,
          artifacts: {},
          isolation: { networkMode: 'none', readonlyRoot: true, capDropAll: true },
          cleaned: true,
        };
      }
      if (opts.role === 'reference' || opts.role === 'alternate') {
        return {
          runId: `v-${opts.role}`,
          role: opts.role,
          containerId: `c-${opts.role}`,
          exitCode: 0,
          executionStatus: 'COMPLETED',
          stdout: 'HARDENED_TEST_PASSED\nbaseline routing passed\n',
          stderr: '',
          durationMs: 900,
          artifacts: {},
          isolation: { networkMode: 'none', readonlyRoot: true, capDropAll: true },
          cleaned: true,
        };
      }
      if (opts.role === 'decoy') {
        return {
          runId: 'v-decoy',
          role: 'decoy',
          containerId: 'c-decoy',
          exitCode: 1,
          executionStatus: 'COMPLETED',
          stdout: '',
          stderr: 'AssertionError: Expected req.routeConfig to be strictly undefined, but got: {}\n',
          durationMs: 800,
          artifacts: {},
          isolation: { networkMode: 'none', readonlyRoot: true, capDropAll: true },
          cleaned: true,
        };
      }
      return { exitCode: 0, executionStatus: 'COMPLETED', stdout: '', stderr: '', artifacts: {}, cleaned: true };
    });

    const res = await developerCommand(
      root,
      ['verify', '--config', 'config.json', '--test', 'repro.test.js', '--patches-dir', 'patches'],
      {},
      { invokeSupervisor: mockSupervisor },
    );

    expect(res).not.toBeNull();
    expect(res?.exitCode).toBe(0);
    const data = res?.data as {
      verdict: string;
      checks: {
        allPresent: boolean;
        buggyFails: boolean;
        referencePasses: boolean;
        alternatePasses: boolean;
        decoyRejects: boolean;
        patchHashesMatch: boolean;
      };
    };
    expect(data.verdict).toBe('VERIFIED');
    expect(data.checks.allPresent).toBe(true);
    expect(data.checks.buggyFails).toBe(true);
    expect(data.checks.referencePasses).toBe(true);
    expect(data.checks.alternatePasses).toBe(true);
    expect(data.checks.decoyRejects).toBe(true);
    expect(data.checks.patchHashesMatch).toBe(true);
  });

  it('returns REJECTED when a candidate patch is missing from patches-dir', async () => {
    const root = await createTempRoot();
    const cfgPath = path.join(root, 'config.json');
    const fastifyConfig = createFastifyPreset();
    await writeFile(cfgPath, JSON.stringify(fastifyConfig, null, 2), 'utf8');

    const testPath = path.join(root, 'repro.test.js');
    await writeFile(testPath, '// test source', 'utf8');

    // Create patches dir with only reference.patch (missing alternate and decoy)
    const patchesDir = path.join(root, 'patches');
    await mkdir(patchesDir, { recursive: true });
    // Intentionally omit reference.patch, alternate.patch, decoy.patch to test missing patch rejection

    const mockSupervisor = vi.fn().mockResolvedValue({
      exitCode: 1,
      executionStatus: 'COMPLETED',
      stdout: '',
      stderr: "TypeError: Cannot read properties of undefined (reading 'config')\n",
      durationMs: 1000,
      isolation: { readonlyRoot: true, capDropAll: true },
      cleaned: true,
    });

    const res = await developerCommand(
      root,
      ['verify', '--config', 'config.json', '--test', 'repro.test.js', '--patches-dir', 'patches'],
      {},
      { invokeSupervisor: mockSupervisor },
    );

    expect(res).not.toBeNull();
    expect(res?.exitCode).toBe(2);
    const data = res?.data as { verdict: string; checks: { allPresent: boolean } };
    expect(data.verdict).toBe('REJECTED');
    expect(data.checks.allPresent).toBe(false);
  });

  it('returns REJECTED when patch hash does not match configured digest', async () => {
    const root = await createTempRoot();
    const cfgPath = path.join(root, 'config.json');
    const fastifyConfig = createFastifyPreset(); // Has specific SHA-256 hashes
    await writeFile(cfgPath, JSON.stringify(fastifyConfig, null, 2), 'utf8');

    const testPath = path.join(root, 'repro.test.js');
    await writeFile(testPath, '// test source', 'utf8');

    // Provide valid unified diff patches whose hashes do not match config.patchHashes
    const validHunkPatch = [
      'diff --git a/lib/request.js b/lib/request.js',
      '--- a/lib/request.js',
      '+++ b/lib/request.js',
      '@@ -1,1 +1,1 @@',
      '-// stub source',
      '+// tampered source',
      '',
    ].join('\n');

    const patchesDir = path.join(root, 'patches');
    await mkdir(patchesDir, { recursive: true });
    await writeFile(path.join(patchesDir, 'reference.patch'), validHunkPatch, 'utf8');
    await writeFile(path.join(patchesDir, 'alternate.patch'), validHunkPatch, 'utf8');
    await writeFile(path.join(patchesDir, 'decoy.patch'), validHunkPatch, 'utf8');

    const mockSupervisor = vi.fn().mockImplementation(async (opts: { role: string }) => {
      if (opts.role === 'buggy') {
        return {
          exitCode: 1,
          executionStatus: 'COMPLETED',
          stdout: '',
          stderr: "TypeError: Cannot read properties of undefined (reading 'config')\n",
          durationMs: 1000,
          isolation: { readonlyRoot: true, capDropAll: true },
          cleaned: true,
        };
      }
      return {
        exitCode: opts.role === 'decoy' ? 1 : 0,
        executionStatus: 'COMPLETED',
        stdout: 'HARDENED_TEST_PASSED\nbaseline routing passed\n',
        stderr: opts.role === 'decoy' ? 'AssertionError\n' : '',
        durationMs: 900,
        isolation: { readonlyRoot: true, capDropAll: true },
        cleaned: true,
      };
    });

    const res = await developerCommand(
      root,
      ['verify', '--config', 'config.json', '--test', 'repro.test.js', '--patches-dir', 'patches'],
      {},
      { invokeSupervisor: mockSupervisor },
    );

    expect(res).not.toBeNull();
    expect(res?.exitCode).toBe(2);
    const data = res?.data as { verdict: string; checks: { patchHashesMatch: boolean } };
    expect(data.verdict).toBe('REJECTED');
    expect(data.checks.patchHashesMatch).toBe(false);
  });

  it('returns REJECTED when decoy patch unexpectedly passes', async () => {
    const root = await createTempRoot();
    const cfgPath = path.join(root, 'config.json');
    const validHunkPatch = [
      'diff --git a/lib/request.js b/lib/request.js',
      '--- a/lib/request.js',
      '+++ b/lib/request.js',
      '@@ -1,1 +1,1 @@',
      '-// stub source',
      '+// patched source',
      '',
    ].join('\n');
    const { createHash } = await import('node:crypto');
    const patchHash = createHash('sha256').update(validHunkPatch).digest('hex');

    const fastifyConfig = createFastifyPreset({
      patchHashes: {
        buggy: '0000000000000000000000000000000000000000000000000000000000000000',
        reference: patchHash,
        alternate: patchHash,
        decoy: patchHash,
      },
    });
    await writeFile(cfgPath, JSON.stringify(fastifyConfig, null, 2), 'utf8');

    const testPath = path.join(root, 'repro.test.js');
    await writeFile(testPath, '// test source', 'utf8');

    const patchesDir = path.join(root, 'patches');
    await mkdir(patchesDir, { recursive: true });
    await writeFile(path.join(patchesDir, 'reference.patch'), validHunkPatch, 'utf8');
    await writeFile(path.join(patchesDir, 'alternate.patch'), validHunkPatch, 'utf8');
    await writeFile(path.join(patchesDir, 'decoy.patch'), validHunkPatch, 'utf8');

    const mockSupervisor = vi.fn().mockImplementation(async (opts: { role: string }) => {
      if (opts.role === 'buggy') {
        return {
          exitCode: 1,
          executionStatus: 'COMPLETED',
          stdout: '',
          stderr: "TypeError: Cannot read properties of undefined (reading 'config')\n",
          durationMs: 1000,
          isolation: { readonlyRoot: true, capDropAll: true },
          cleaned: true,
        };
      }
      if (opts.role === 'decoy') {
        // Flawed decoy unexpectedly passes!
        return {
          exitCode: 0,
          executionStatus: 'COMPLETED',
          stdout: 'PASSED\n',
          stderr: '',
          durationMs: 800,
          isolation: { readonlyRoot: true, capDropAll: true },
          cleaned: true,
        };
      }
      return {
        exitCode: 0,
        executionStatus: 'COMPLETED',
        stdout: 'PASSED\nbaseline routing passed\n',
        stderr: '',
        durationMs: 900,
        isolation: { readonlyRoot: true, capDropAll: true },
        cleaned: true,
      };
    });

    const res = await developerCommand(
      root,
      ['verify', '--config', 'config.json', '--test', 'repro.test.js', '--patches-dir', 'patches'],
      {},
      { invokeSupervisor: mockSupervisor },
    );

    expect(res).not.toBeNull();
    expect(res?.exitCode).toBe(2);
    const data = res?.data as { verdict: string };
    expect(data.verdict).toBe('REJECTED');
  });
});
