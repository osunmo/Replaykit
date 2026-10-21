import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ExternalExecutionSchema,
  ExternalManifestSchema,
  OfficialReportSchema,
} from '../../../contracts/src/external.js';
import {
  buildGenericExecutionRecord,
  createFastifyPreset,
  createGenericManifest,
  GenericAdapterConfigSchema,
  normalizeGenericTestOutput,
  sha256,
  stageGenericPayload,
  validateCommandArguments,
  type GenericAdapterConfig,
} from './generic-adapter.js';
import { applyCandidatePatch, applyHunksToContent } from '../patch-applier.js';

describe('Generic Adapter Interface & Security Verification', () => {
  describe('Configuration Schema Validation', () => {
    it('accepts a valid generic configuration', () => {
      const config = createFastifyPreset();
      expect(GenericAdapterConfigSchema.safeParse(config).success).toBe(true);
    });

    it('rejects path traversal in testFile and sourceFiles', () => {
      const base = createFastifyPreset();
      const traversal = {
        ...base,
        testFile: '../evil.js',
      };
      expect(GenericAdapterConfigSchema.safeParse(traversal).success).toBe(false);
    });

    it('rejects invalid commit SHAs and hashes', () => {
      const base = createFastifyPreset();
      const invalidSha = {
        ...base,
        baseCommit: 'not-a-sha',
      };
      expect(GenericAdapterConfigSchema.safeParse(invalidSha).success).toBe(false);
    });

    it('validates examples/qs33.json against GenericAdapterConfigSchema', async () => {
      const raw = JSON.parse(await readFile(path.resolve(process.cwd(), 'examples/qs33.json'), 'utf8'));
      const parsed = GenericAdapterConfigSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
    });

    it('validates examples/fastify4807.json against GenericAdapterConfigSchema', async () => {
      const raw = JSON.parse(await readFile(path.resolve(process.cwd(), 'examples/fastify4807.json'), 'utf8'));
      const parsed = GenericAdapterConfigSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
    });
  });

  describe('Security Policies & Command Allowlist', () => {
    it('allows trusted executables (node, npm, vitest, lab)', () => {
      expect(() => validateCommandArguments(['node', 'test/repro.test.js'])).not.toThrow();
      expect(() => validateCommandArguments(['npm', 'test'])).not.toThrow();
      expect(() => validateCommandArguments(['npx', 'mocha', 'test/repro.js'])).not.toThrow();
    });

    it('rejects untrusted binaries (bash, sh, curl, python)', () => {
      expect(() => validateCommandArguments(['/bin/bash', '-c', 'ls'])).toThrow('COMMAND_UNTRUSTED_BINARY');
      expect(() => validateCommandArguments(['sh', 'run.sh'])).toThrow('COMMAND_UNTRUSTED_BINARY');
      expect(() => validateCommandArguments(['curl', 'https://attacker.com'])).toThrow('COMMAND_UNTRUSTED_BINARY');
    });

    it('rejects shell metacharacters and command chaining tokens', () => {
      expect(() => validateCommandArguments(['node', 'test.js; rm -rf /'])).toThrow('COMMAND_INJECTION_DETECTED');
      expect(() => validateCommandArguments(['node', 'test.js && cat /etc/passwd'])).toThrow('COMMAND_INJECTION_DETECTED');
      expect(() => validateCommandArguments(['node', '$(whoami).js'])).toThrow('COMMAND_INJECTION_DETECTED');
      expect(() => validateCommandArguments(['node', '`id`.js'])).toThrow('COMMAND_INJECTION_DETECTED');
      expect(() => validateCommandArguments(['node', 'test.js | grep secret'])).toThrow('COMMAND_INJECTION_DETECTED');
    });

    it('allows trusted Windows executables (node.exe, npm.cmd)', () => {
      expect(() => validateCommandArguments(['node.exe', 'test/repro.test.js'])).not.toThrow();
      expect(() => validateCommandArguments(['npm.cmd', 'test'])).not.toThrow();
    });

    it('rejects newlines and null bytes in command arguments', () => {
      expect(() => validateCommandArguments(['node', 'test.js\nmalicious'])).toThrow('COMMAND_INJECTION_DETECTED');
      expect(() => validateCommandArguments(['node', 'test.js\0malicious'])).toThrow('COMMAND_INJECTION_DETECTED');
    });
  });

  describe('Output Normalization', () => {
    it('normalizes TAP test outputs into OfficialReportSchema', () => {
      const tapStdout = `
1..2
ok 1 request GET /health should succeed
not ok 2 request GET /test/%world should return 400
  TypeError: Cannot read properties of undefined (reading 'config')
    at Request.get routeConfig (lib/request.js:201:52)
`;
      const report = normalizeGenericTestOutput(tapStdout, '', 'tap');
      expect(report.reporter).toBe('official-suite-normalized-v1');
      expect(report.tests).toHaveLength(2);
      expect(report.tests[0]!.status).toBe('passed');
      expect(report.tests[1]!.status).toBe('failed');
      expect(report.tests[1]!.failure?.type).toBe('TypeError');
      expect(report.tests[1]!.failure?.topApplicationFrame).toBe(
        'at Request.get routeConfig (lib/request.js:201:52)',
      );
    });

    it('normalizes native Node uncaught exceptions', () => {
      const nodeStderr = `
node:internal/process/promises:394
            triggerUncaughtException(err, true /* fromPromise */);
            ^

TypeError: Cannot read properties of undefined (reading 'config')
    at Request.get routeConfig (/case/lib/request.js:201:52)
    at Object.frameworkErrors (/case/test/repro.test.js:15:17)
`;
      const report = normalizeGenericTestOutput('', nodeStderr, 'node:test');
      expect(report.tests).toHaveLength(1);
      expect(report.tests[0]!.status).toBe('failed');
      expect(report.tests[0]!.failure?.type).toBe('TypeError');
      expect(report.tests[0]!.failure?.topApplicationFrame).toBe(
        'at Request.get routeConfig (/case/lib/request.js:201:52)',
      );
    });

    it('normalizes process failures with non-zero exit code as failed even without Error keyword', () => {
      const report = normalizeGenericTestOutput('', 'Command failed with exit code 1', 'node:test', 1);
      expect(report.tests).toHaveLength(1);
      expect(report.tests[0]!.status).toBe('failed');
      expect(report.tests[0]!.failure?.type).toBe('ProcessExecutionError');
      expect(report.tests[0]!.failure?.topApplicationFrame).toBe('at unknown (unknown:0:0)');
    });

    it('normalizes clean runs with exit code 0 as passed', () => {
      const report = normalizeGenericTestOutput('all tests passed', '', 'node:test', 0);
      expect(report.tests).toHaveLength(1);
      expect(report.tests[0]!.status).toBe('passed');
      expect(report.tests[0]!.failure).toBeNull();
    });

    it('rejects swallowed error logs as failed even if process exit code was 0', () => {
      const output = 'Test failed: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal';
      const report = normalizeGenericTestOutput(output, '', 'node:test', 0);
      expect(report.tests).toHaveLength(1);
      expect(report.tests[0]!.status).toBe('failed');
      expect(report.tests[0]!.failure?.type).toBe('AssertionError');
    });

    it('rejects unhandled promise rejections as failed even if process exit code was 0', () => {
      const stderr = '(node:1234) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated...';
      const report = normalizeGenericTestOutput('', stderr, 'node:test', 0);
      expect(report.tests).toHaveLength(1);
      expect(report.tests[0]!.status).toBe('failed');
      expect(report.tests[0]!.failure?.type).toBe('UnhandledRejectionError');
    });

    it('normalizes execution timeouts as failed with TimeoutError', () => {
      const stderr = 'Error: Test timed out after 5000ms: Fastify injection did not settle';
      const report = normalizeGenericTestOutput('', stderr, 'node:test', 1);
      expect(report.tests).toHaveLength(1);
      expect(report.tests[0]!.status).toBe('failed');
      expect(report.tests[0]!.failure?.type).toBe('TimeoutError');
    });
  });

  describe('Staging & Manifest Generation', () => {
    it('stages source and generates supervisor runner script without leaks', async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'rk-generic-stage-'));
      const sourceDir = path.join(tmpDir, 'source');
      const targetDir = path.join(tmpDir, 'staged');

      await mkdir(sourceDir, { recursive: true });
      await writeFile(path.join(sourceDir, 'package.json'), JSON.stringify({ name: 'mock-target' }));
      await mkdir(path.join(sourceDir, 'lib'), { recursive: true });
      await writeFile(path.join(sourceDir, 'lib', 'request.js'), '// original source');
      await writeFile(path.join(sourceDir, 'fastify.js'), '// fastify');

      const config = createFastifyPreset({
        sourceFiles: ['package.json', 'lib/request.js', 'fastify.js', 'test/repro.test.js'],
      });

      const stagingInfo = await stageGenericPayload({
        targetDir,
        role: 'buggy',
        sourceBaseDir: sourceDir,
        config,
        generatedTestSource: '// synthesized regression test',
      });

      expect(stagingInfo.stagedDir).toBe(targetDir);
      expect(stagingInfo.patchHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
      expect(stagingInfo.sourceHashes['package.json']).toBeDefined();
      expect(stagingInfo.sourceHashes['lib/request.js']).toBeDefined();

      const injectedContent = await readFile(path.join(targetDir, 'test', 'repro.test.js'), 'utf8');
      expect(injectedContent).toBe('// synthesized regression test');

      const runnerScript = await readFile(path.join(targetDir, 'supervisor-runner.js'), 'utf8');
      expect(runnerScript).toContain('exportBytes');
      expect(runnerScript).toContain('test/repro.test.js');

      // Verify manifest generation
      const manifest = createGenericManifest(
        config,
        '// synthesized regression test',
        stagingInfo.testFileHash,
        stagingInfo.testPatchHash,
      );
      expect(ExternalManifestSchema.safeParse(manifest).success).toBe(true);

      // Verify execution record creation
      const mockSupervisorResult = {
        runId: 'gen-test-01',
        role: 'buggy',
        containerId: 'c123456789012',
        exitCode: 1,
        executionStatus: 'COMPLETED' as const,
        stdout: '',
        stderr: 'TypeError: Cannot read properties of undefined',
        durationMs: 120,
        artifacts: {},
        isolation: {
          networkMode: 'none',
          user: '1000:1000',
          readonlyRoot: true,
          capDropAll: true,
          noNewPrivileges: true,
          cpus: 1,
          memoryBytes: 268435456,
          pidsLimit: 64,
          mounts: [] as Array<{ type: 'tmpfs'; destination: '/tmp' | '/run' | '/workspace' | '/testbed' }>,
        },
        cleaned: true,
      };

      const normalizedReport = normalizeGenericTestOutput('', mockSupervisorResult.stderr);
      const execution = buildGenericExecutionRecord(
        mockSupervisorResult,
        stagingInfo,
        normalizedReport,
        config,
      );

      expect(ExternalExecutionSchema.safeParse(execution).success).toBe(true);
      expect(execution.exitCode).toBe(1);
      expect(execution.patchHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');

      await rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe('Patch Applier & Hunk Edge Cases', () => {
    it('handles hunk.oldStart === 0 correctly when prepending lines to file', () => {
      const content = 'foo\nbar\n';
      const hunks = [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ['+header'] }];
      const result = applyHunksToContent(content, hunks);
      expect(result).toBe('header\nfoo\nbar\n');
    });

    it('applies multi-file patch diffs across multiple files cleanly', async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'rk-multifile-'));
      await mkdir(path.join(tmpDir, 'lib'), { recursive: true });
      await writeFile(path.join(tmpDir, 'lib', 'fileA.js'), 'const a = 1;\n');
      await writeFile(path.join(tmpDir, 'lib', 'fileB.js'), 'const b = 2;\n');

      const patch = `diff --git a/lib/fileA.js b/lib/fileA.js
--- a/lib/fileA.js
+++ b/lib/fileA.js
@@ -1,1 +1,1 @@
-const a = 1;
+const a = 10;
diff --git a/lib/fileB.js b/lib/fileB.js
--- a/lib/fileB.js
+++ b/lib/fileB.js
@@ -1,1 +1,1 @@
-const b = 2;
+const b = 20;
`;
      const patchHash = sha256(patch.replace(/\r\n/g, '\n'));
      const result = await applyCandidatePatch({
        stagingDir: tmpDir,
        patch,
        expectedPatchHash: patchHash,
        allowlist: ['lib/fileA.js', 'lib/fileB.js'],
        sourceFiles: ['lib/fileA.js', 'lib/fileB.js'],
      });

      expect(result.applied).toBe(true);
      expect(result.changedFiles).toEqual(['lib/fileA.js', 'lib/fileB.js']);
      expect(await readFile(path.join(tmpDir, 'lib', 'fileA.js'), 'utf8')).toBe('const a = 10;\n');
      expect(await readFile(path.join(tmpDir, 'lib', 'fileB.js'), 'utf8')).toBe('const b = 20;\n');
      await rm(tmpDir, { recursive: true, force: true });
    });
  });
});
