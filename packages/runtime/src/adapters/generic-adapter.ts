import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  ExternalExecutionSchema,
  ExternalManifestSchema,
  OfficialReportSchema,
  type ExternalExecution,
  type ExternalManifest,
} from '../../../contracts/src/external.js';
import type { SupervisorExecutionResult } from '../external-supervisor.js';
import { applyCandidatePatch } from '../patch-applier.js';

export const Sha256Regex = /^[a-f0-9]{64}$/;
export const GitCommitRegex = /^[a-f0-9]{40}$/;
export const ContainerImageRegex = /^[a-zA-Z0-9._/:-]+@sha256:[a-f0-9]{64}$/;

export const RelativePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (val) =>
      !val.includes('\\') &&
      !val.includes(':') &&
      !val.startsWith('/') &&
      !val.split('/').some((p) => !p || p === '.' || p === '..'),
    'Expected a contained repository-relative path without traversal',
  );

/**
 * 1. Security Execution Policy for Command Line Invocation
 * Enforces allowlisted binaries and prevents shell injection.
 */
export const ALLOWED_EXECUTABLES = new Set([
  'node',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'mocha',
  'vitest',
  'tap',
  'lab',
]);

const BANNED_SHELL_TOKENS = /[;&|`$<>()\r\n\0]/;

export function validateCommandArguments(cmd: string[]): void {
  if (!cmd || cmd.length === 0) {
    throw new Error('COMMAND_EMPTY: Command array must have at least one element');
  }
  const [binary] = cmd;
  const bareBinary = path.basename(binary ?? '').replace(/\.(?:exe|cmd|bat)$/i, '');
  if (!ALLOWED_EXECUTABLES.has(bareBinary)) {
    throw new Error(`COMMAND_UNTRUSTED_BINARY: '${binary}' is not in the trusted execution allowlist`);
  }
  for (const arg of cmd) {
    if (BANNED_SHELL_TOKENS.test(arg)) {
      throw new Error(`COMMAND_INJECTION_DETECTED: Argument contains banned shell token: '${arg}'`);
    }
  }
}

/**
 * 2. Generic Adapter Configuration Schema
 */
export const GenericAdapterConfigSchema = z.strictObject({
  instanceId: z.string().min(1).max(256),
  repository: z.string().url(),
  baseCommit: z.string().regex(GitCommitRegex),
  fixedCommit: z.string().regex(GitCommitRegex).optional(),
  image: z.string().regex(ContainerImageRegex),
  runtime: z.string().default('node:22'),
  testRunner: z.enum(['tap', 'mocha', 'jest', 'node:test', 'custom']).default('node:test'),
  testFile: RelativePathSchema.default('test/repro.test.js'),
  testCommand: z.array(z.string().min(1)).min(1),
  suiteCommand: z.array(z.string().min(1)).optional(),
  sourceFiles: z.array(RelativePathSchema).min(1),
  patchAllowlist: z.array(RelativePathSchema),
  failToPass: z.array(z.string().min(1)).min(1),
  passToPass: z.array(z.string().min(1)),
  expectedFailure: z.strictObject({
    type: z.string().min(1),
    message: z.string().optional(),
    topApplicationFrame: z.string().min(1),
  }),
  patchHashes: z.strictObject({
    buggy: z.string().regex(Sha256Regex),
    reference: z.string().regex(Sha256Regex),
    alternate: z.string().regex(Sha256Regex),
    decoy: z.string().regex(Sha256Regex),
  }),
  securityPolicy: z
    .strictObject({
      readonlyRoot: z.boolean().default(true),
      maxMemoryBytes: z.number().int().positive().default(268435456), // 256 MiB
      maxCpus: z.number().positive().default(1),
      timeoutSeconds: z.number().int().positive().default(30),
      networkMode: z.literal('none').default('none'),
    })
    .default({
      readonlyRoot: true,
      maxMemoryBytes: 268435456,
      maxCpus: 1,
      timeoutSeconds: 30,
      networkMode: 'none',
    }),
  incidentFile: z.string().optional(),
  workspaceDir: z.string().optional(),
  patchesDir: z.string().optional(),
  modulesDir: z.string().optional(),
});

export type GenericAdapterConfig = z.infer<typeof GenericAdapterConfigSchema>;

export const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

/**
 * 3. Generic Staging Result
 */
export interface GenericStagingInfo {
  stagedDir: string;
  patchHash: string;
  sourceHashes: Record<string, string>;
  testFileHash: string;
  testPatchHash: string;
  candidateHash: string;
}

/**
 * 4. Staging Function
 * Stages target files, injects test file, applies candidate patch, and writes entrypoint.
 */
export async function stageGenericPayload(options: {
  targetDir: string;
  role: 'buggy' | 'reference' | 'alternate' | 'decoy';
  sourceBaseDir: string;
  config: GenericAdapterConfig;
  generatedTestSource: string;
  candidatePatch?: string;
  additionalModulesDir?: string;
}): Promise<GenericStagingInfo> {
  const { targetDir, role, sourceBaseDir, config, generatedTestSource, candidatePatch } = options;

  // Validate trusted commands
  validateCommandArguments(config.testCommand);
  if (config.suiteCommand) {
    validateCommandArguments(config.suiteCommand);
  }

  await mkdir(targetDir, { recursive: true });

  // 1. Copy clean source base
  await cp(sourceBaseDir, targetDir, { recursive: true });

  // 2. If node_modules provided separately, link/copy
  if (options.additionalModulesDir) {
    await cp(options.additionalModulesDir, path.join(targetDir, 'node_modules'), {
      recursive: true,
    });
  }

  // 3. Inject generated test source
  const fullTestFilePath = path.join(targetDir, config.testFile);
  await mkdir(path.dirname(fullTestFilePath), { recursive: true });
  await writeFile(fullTestFilePath, generatedTestSource, 'utf8');

  // 4. Apply candidate patch if present and role is not buggy
  let appliedPatchHash = '0000000000000000000000000000000000000000000000000000000000000000';
  if (role !== 'buggy' && candidatePatch) {
    appliedPatchHash = sha256(candidatePatch);
    await applyCandidatePatch({
      stagingDir: targetDir,
      patch: candidatePatch,
      expectedBaseCommit: config.baseCommit,
      expectedPatchHash: appliedPatchHash,
      allowlist: config.patchAllowlist as unknown as string[],
      sourceFiles: config.patchAllowlist as unknown as string[],
    });
  }

  // 5. Generate container runner script with artifact streaming
  const runnerScript = `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function exportBytes(name, bytes, append) {
  process.stdout.write(JSON.stringify({
    event: 'artifact',
    path: name,
    append: !!append,
    base64: bytes.toString('base64')
  }) + '\\n');
}

async function run(name, cmdArgs) {
  const [bin, ...args] = cmdArgs;
  const record = { argv: [bin, ...args], exitCode: null, signal: null };
  exportBytes(name + '.stdout', Buffer.alloc(0), false);
  exportBytes(name + '.stderr', Buffer.alloc(0), false);
  await new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: '/case',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (bytes) => exportBytes(name + '.stdout', bytes, true));
    child.stderr.on('data', (bytes) => exportBytes(name + '.stderr', bytes, true));
    child.on('close', (code, signal) => {
      record.exitCode = code;
      record.signal = signal;
      resolve();
    });
  });
  exportBytes(name + '.json', Buffer.from(JSON.stringify(record, null, 2) + '\\n'), false);
  return record;
}

(async () => {
  const testCmd = ${JSON.stringify(config.testCommand)};
  const testRecord = await run('official', testCmd);

  if (${JSON.stringify(!!config.suiteCommand)}) {
    const suiteCmd = ${JSON.stringify(config.suiteCommand ?? [])};
    await run('suite', suiteCmd);
  }

  process.exit(testRecord.exitCode ?? 1);
})().catch((err) => {
  console.error('SUPERVISOR_RUNNER_ERROR:', err);
  process.exit(1);
});
`;

  await writeFile(path.join(targetDir, 'supervisor-runner.js'), runnerScript, 'utf8');

  // 6. Compute source inventory hashes
  const sourceHashes: Record<string, string> = {};
  for (const relFile of config.sourceFiles) {
    try {
      const fileBuf = await readFile(path.join(targetDir, relFile));
      sourceHashes[relFile] = sha256(fileBuf);
    } catch {
      // File not present in tree
    }
  }

  const testFileHash = sha256(await readFile(fullTestFilePath));
  const testPatchHash = sha256(generatedTestSource);
  const candidateHash = sha256(generatedTestSource);

  return {
    stagedDir: targetDir,
    patchHash: appliedPatchHash,
    sourceHashes,
    testFileHash,
    testPatchHash,
    candidateHash,
  };
}

/**
 * 5. Generic Runner Output Normalization
 */
export function normalizeGenericTestOutput(
  stdout: string,
  stderr: string,
  runnerType: 'tap' | 'mocha' | 'jest' | 'node:test' | 'custom' = 'node:test',
  exitCode?: number | null,
): ReturnType<typeof OfficialReportSchema.parse> {
  const tests: Array<{
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    failure: {
      type: string;
      message?: string;
      topApplicationFrame: string;
    } | null;
  }> = [];

  const combinedOutput = `${stdout}\n${stderr}`;
  const lines = combinedOutput.split(/\r?\n/);

  // Parse TAP output if format is tap or output starts with TAP indicators
  const isTap = runnerType === 'tap' || /^(?:TAP version|1\.\.\d+|ok \d+|not ok \d+)/m.test(combinedOutput);

  if (isTap) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const match = /^(ok|not ok) (\d+) (.+)$/.exec(line);
      if (!match) continue;

      const [, okPrefix, , title] = match;
      const cleanTitle = title!.trim();
      const isOk = okPrefix === 'ok';

      if (isOk) {
        tests.push({ name: cleanTitle, status: 'passed', failure: null });
      } else {
        let failureType = 'Error';
        let topFrame = 'at unknown (unknown:0:0)';
        let failureMessage = '';

        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          const nextLine = lines[j]!;
          if (/^(?:ok|not ok) \d+/.test(nextLine)) break;

          const errMatch = /^\s*([A-Za-z0-9_]+Error):\s*(.*)$/.exec(nextLine);
          if (errMatch && failureType === 'Error') {
            failureType = errMatch[1]!;
            failureMessage = errMatch[2]!.trim();
          }

          const frameMatch = /^\s*at\s+(.+?)\s+\(([^)]+)\)/.exec(nextLine);
          if (frameMatch && topFrame === 'at unknown (unknown:0:0)') {
            topFrame = `at ${frameMatch[1]!.trim()} (${frameMatch[2]})`;
          }
        }

        tests.push({
          name: cleanTitle,
          status: 'failed',
          failure: {
            type: failureType,
            topApplicationFrame: topFrame,
          },
        });
      }
    }
  }

  // If no TAP tests detected, parse standard Node test / uncaught exception output
  if (tests.length === 0) {
    const errorMatch = /([A-Za-z0-9_]+Error)(?:\s*\[[^\]]+\])?:\s*(.*)/.exec(combinedOutput);
    let topFrame = 'at unknown (unknown:0:0)';

    if (errorMatch) {
      const errIndex = errorMatch.index;
      const afterError = combinedOutput.slice(errIndex);
      const frameMatch = /at\s+(.+?)\s+\(([^)]+)\)/.exec(afterError);
      if (frameMatch) {
        topFrame = `at ${frameMatch[1]!.trim()} (${frameMatch[2]})`;
      }
    }

    const hasFailureExit = exitCode !== undefined && exitCode !== null && exitCode !== 0;
    const hasUnhandledRejection =
      /UnhandledPromiseRejection|Unhandled promise rejection|ERR_UNHANDLED_REJECTION/i.test(
        combinedOutput,
      );
    const hasSwallowedFailureLog =
      /Test failed:|HARDENED_TEST_FAILED:|AssertionError/i.test(combinedOutput);
    const hasTimeout = /timed out|timeout/i.test(combinedOutput);

    // Test passes ONLY if exit code is 0, no error match, no unhandled rejections, no swallowed failure logs, and no timeouts
    const testPassed =
      !errorMatch &&
      !hasFailureExit &&
      !hasUnhandledRejection &&
      !hasSwallowedFailureLog &&
      !hasTimeout;

    if (testPassed) {
      tests.push({
        name: 'generic regression test',
        status: 'passed',
        failure: null,
      });
    } else {
      let errType = errorMatch ? (errorMatch[1] ?? 'Error') : 'ProcessExecutionError';
      if (hasTimeout && !errorMatch) {
        errType = 'TimeoutError';
      } else if (hasUnhandledRejection && !errorMatch) {
        errType = 'UnhandledRejectionError';
      } else if (hasSwallowedFailureLog && !errorMatch) {
        errType = combinedOutput.includes('AssertionError')
          ? 'AssertionError'
          : 'SwallowedAssertionError';
      }

      tests.push({
        name: 'generic regression test',
        status: 'failed',
        failure: {
          type: errType,
          topApplicationFrame: topFrame,
        },
      });
    }
  }

  const report = {
    reporter: 'official-suite-normalized-v1' as const,
    tests,
  };

  return OfficialReportSchema.parse(report);
}

/**
 * 6. Generic Execution Record Builder
 */
export function buildGenericExecutionRecord(
  supervisorResult: SupervisorExecutionResult,
  stagingInfo: GenericStagingInfo,
  normalizedReport: ReturnType<typeof OfficialReportSchema.parse>,
  config: GenericAdapterConfig,
): ExternalExecution {
  const reportJson = JSON.stringify(normalizedReport);
  const reportHash = sha256(reportJson);

  const execution: ExternalExecution = {
    contract: 'external-official-suite-v1',
    instanceId: config.instanceId,
    baseCommit: config.baseCommit,
    runId: supervisorResult.runId,
    image: config.image,
    patchHash: stagingInfo.patchHash,
    testPatchHash: stagingInfo.testPatchHash,
    candidateHash: stagingInfo.candidateHash,
    sourceHashes: stagingInfo.sourceHashes,
    executionStatus: supervisorResult.executionStatus,
    exitCode: supervisorResult.exitCode,
    reportJson,
    reportHash,
    freshWorkspace: true,
    durationMs: supervisorResult.durationMs,
    isolation: {
      networkMode: supervisorResult.isolation.networkMode,
      user: supervisorResult.isolation.user,
      readonlyRoot: supervisorResult.isolation.readonlyRoot,
      capDropAll: supervisorResult.isolation.capDropAll,
      noNewPrivileges: supervisorResult.isolation.noNewPrivileges,
      cpus: supervisorResult.isolation.cpus,
      memoryBytes: supervisorResult.isolation.memoryBytes,
      pidsLimit: supervisorResult.isolation.pidsLimit,
      mounts: supervisorResult.isolation.mounts,
    },
  };

  return ExternalExecutionSchema.parse(execution);
}

/**
 * 7. Generic External Manifest Factory
 */
export function createGenericManifest(
  config: GenericAdapterConfig,
  testSource: string,
  testFileHash: string,
  testPatchHash: string,
): ExternalManifest {
  const manifest: ExternalManifest = {
    contract: 'external-official-suite-v1',
    instanceId: config.instanceId,
    baseCommit: config.baseCommit,
    image: config.image,
    testPatchHash,
    candidateHash: sha256(testSource),
    testFile: config.testFile,
    testFileHash,
    sourceFiles: config.sourceFiles,
    failToPass: config.failToPass,
    passToPass: config.passToPass,
    expectedFailure: config.expectedFailure,
    patchHashes: config.patchHashes,
  };

  return ExternalManifestSchema.parse(manifest);
}

/**
 * 8. Presets for Supported Backend Frameworks
 */
export function createFastifyPreset(
  overrides?: Partial<GenericAdapterConfig>,
): GenericAdapterConfig {
  const baseConfig: GenericAdapterConfig = {
    instanceId: 'fastify__issue-4807',
    repository: 'https://github.com/fastify/fastify.git',
    baseCommit: '61b86760019c85afbef6cc0f175c75870381ed04',
    fixedCommit: 'c2b89732d583a0e0d8e0a666b2eb9b62610edf34',
    image:
      'node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392',
    runtime: 'node:22',
    testRunner: 'node:test',
    testFile: 'test/repro.test.js',
    testCommand: ['node', 'test/repro.test.js'],
    suiteCommand: ['node', 'test/baseline-sanity.js'],
    sourceFiles: ['package.json', 'lib/request.js', 'fastify.js', 'test/baseline-sanity.js', 'test/repro.test.js'],
    patchAllowlist: ['lib/request.js'],
    failToPass: ['generic regression test'],
    passToPass: ['baseline routing passed'],
    expectedFailure: {
      type: 'TypeError',
      topApplicationFrame: 'at Request.get (/case/lib/request.js:204:55)',
    },
    patchHashes: {
      buggy: '0000000000000000000000000000000000000000000000000000000000000000',
      reference: 'da9cbf56526132f4039af5fd2c5e1e9793c78910cb5c5e5441ead1becf826c39',
      alternate: 'e8cb28e30434c3d4ce774a866e2533a620be6291f9b59fa70711190dc89d6997',
      decoy: 'f9a1a4ceb7571fea2d7230c720da423c1f37f72bca49819470261c5aed4bb78d',
    },
    securityPolicy: {
      readonlyRoot: true,
      maxMemoryBytes: 268435456,
      maxCpus: 1,
      timeoutSeconds: 30,
      networkMode: 'none',
    },
  };

  return GenericAdapterConfigSchema.parse({
    ...baseConfig,
    ...overrides,
  });
}

export function createQsPreset(
  overrides?: Partial<GenericAdapterConfig>,
): GenericAdapterConfig {
  const baseConfig: GenericAdapterConfig = {
    instanceId: 'qs__issue-33',
    repository: 'https://github.com/hapijs/qs.git',
    baseCommit: '360e2b0b48548b9bfdb71f8c82a68c4f34ec0725',
    fixedCommit: '6a97ad1d71d8a9069f5d6002cab3130752519ccb',
    image:
      'node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392',
    runtime: 'node:22',
    testRunner: 'tap',
    testFile: 'test/repro.test.js',
    testCommand: [
      'node',
      '--require',
      '/case/gate-b-lab-adaptation.cjs',
      'node_modules/lab/bin/lab',
      'test/repro.test.js',
      '-r',
      'tap',
    ],
    suiteCommand: [
      'node',
      '--require',
      '/case/gate-b-lab-adaptation.cjs',
      'node_modules/lab/bin/lab',
      '-r',
      'tap',
    ],
    sourceFiles: [
      'package.json',
      'lib/index.js',
      'lib/parse.js',
      'lib/stringify.js',
      'lib/utils.js',
      'test/parse.js',
      'test/stringify.js',
      'gate-b-lab-adaptation.cjs',
    ],
    patchAllowlist: ['lib/parse.js', 'lib/stringify.js', 'lib/utils.js'],
    failToPass: ['parse parses plain objects correctly'],
    passToPass: ['parse parses a simple string'],
    expectedFailure: {
      type: 'TypeError',
      message: 'source.hasOwnProperty is not a function',
      topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)',
    },
    patchHashes: {
      buggy: '0000000000000000000000000000000000000000000000000000000000000000',
      reference: 'fc1d3f9205a621617ca4f86432411dfddf6422432dfcb6d80f936af920cafe8e',
      alternate: '760d2dbd744d610b81426da10c412fc8db40b930e15ce895296157eaeb24ff28',
      decoy: '318a5449a218b2d5d882fc6993086de1f53300559f1dfd2ed0d30696c87f6e81',
    },
    securityPolicy: {
      readonlyRoot: true,
      maxMemoryBytes: 268435456,
      maxCpus: 1,
      timeoutSeconds: 30,
      networkMode: 'none',
    },
    incidentFile: 'incident.json',
    workspaceDir: 'workspace',
    patchesDir: 'patches',
    modulesDir: 'modules',
  };

  return GenericAdapterConfigSchema.parse({
    ...baseConfig,
    ...overrides,
  });
}

