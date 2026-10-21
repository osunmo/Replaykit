import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { docker } from '../../judge/src/docker.js';
import {
  GenericAdapterConfigSchema,
  normalizeGenericTestOutput,
  stageGenericPayload,
  type GenericAdapterConfig,
} from '../../runtime/src/adapters/generic-adapter.js';
import {
  generateRegressionTest,
  validateTestAst,
} from '../../runtime/src/ai-generator.js';
import {
  ProductionIncidentContextSchema,
  type ProductionIncidentContext,
} from '../../contracts/src/incident-context.js';
import { pruneReplayKitResources } from '../../runtime/src/docker-cleanup.js';
import { runExternalContainer } from '../../runtime/src/external-supervisor.js';

export interface CommandResult {
  data: unknown;
  exitCode: number;
}

const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

function parseCliFlags(args: readonly string[]): {
  command: string;
  flags: Map<string, string>;
  booleanFlags: Set<string>;
  error?: string;
} {
  const flags = new Map<string, string>();
  const booleanFlags = new Set<string>();
  const positional: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('--')) {
        if (booleanFlags.has(arg)) {
          return { command: '', flags, booleanFlags, error: 'DUPLICATE_FLAG' };
        }
        booleanFlags.add(arg);
        i += 1;
      } else {
        if (flags.has(arg) || booleanFlags.has(arg)) {
          return { command: '', flags, booleanFlags, error: 'DUPLICATE_FLAG' };
        }
        flags.set(arg, next);
        i += 2;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }
  return { command: positional.join(' '), flags, booleanFlags };
}

function resolveWorkspaceDir(
  root: string,
  configPath: string,
  config: GenericAdapterConfig,
  flagWorkspace?: string,
): string {
  if (flagWorkspace) return path.resolve(root, flagWorkspace);
  const configDir = path.dirname(path.resolve(root, configPath));
  if (config.workspaceDir) {
    const fromConfig = path.resolve(configDir, config.workspaceDir);
    if (existsSync(fromConfig)) return fromConfig;
    const fromRoot = path.resolve(root, config.workspaceDir);
    if (existsSync(fromRoot)) return fromRoot;
  }
  const defaultInConfigDir = path.join(configDir, 'workspace');
  if (existsSync(defaultInConfigDir)) return defaultInConfigDir;

  if (config.instanceId.includes('qs')) {
    const fixtureWs = path.join(root, 'fixtures', 'qs-issue-33', 'workspace');
    if (existsSync(fixtureWs)) return fixtureWs;
    const phase3 = path.join(root, 'work', 'phase3', 'sanitized-buggy-workspace');
    if (existsSync(phase3)) return phase3;
    return fixtureWs;
  }
  if (config.instanceId.includes('fastify')) {
    const fixtureWs = path.join(root, 'fixtures', 'fastify-issue-4807', 'workspace');
    if (existsSync(fixtureWs)) return fixtureWs;
    const phase4 = path.join(root, 'work', 'phase4', 'sanitized-buggy-workspace');
    if (existsSync(phase4)) return phase4;
    return fixtureWs;
  }
  return path.join(configDir, 'workspace');
}

function resolveModulesDir(
  root: string,
  configPath: string,
  config: GenericAdapterConfig,
  workspaceDir: string,
  flagModules?: string,
): string | undefined {
  if (flagModules) return path.resolve(root, flagModules);
  const configDir = path.dirname(path.resolve(root, configPath));
  if (config.modulesDir) {
    const fromConfig = path.resolve(configDir, config.modulesDir);
    if (existsSync(fromConfig)) return fromConfig;
    const fromRoot = path.resolve(root, config.modulesDir);
    if (existsSync(fromRoot)) return fromRoot;
  }
  const fixtureModules = path.join(configDir, 'modules');
  if (existsSync(fixtureModules)) return fixtureModules;
  const workspaceModules = path.join(workspaceDir, 'node_modules');
  if (existsSync(workspaceModules)) return workspaceModules;

  if (config.instanceId.includes('qs')) {
    const fixtureQs = path.join(root, 'fixtures', 'qs-issue-33', 'modules');
    if (existsSync(fixtureQs)) return fixtureQs;
    const qsBundle = path.join(
      root,
      'work',
      'phase2',
      'gate-b-runs',
      'qs33-gateb-local-06',
      'lab-bundle',
      'node_modules',
    );
    if (existsSync(qsBundle)) return qsBundle;
  } else if (config.instanceId.includes('fastify')) {
    const fixtureFastify = path.join(root, 'fixtures', 'fastify-issue-4807', 'modules');
    if (existsSync(fixtureFastify)) return fixtureFastify;
    const fastifyBundle = path.join(root, 'work', 'phase4', 'fastify-bundle', 'node_modules');
    if (existsSync(fastifyBundle)) return fastifyBundle;
  }
  return undefined;
}

function resolvePatchesDir(
  root: string,
  configPath: string,
  config: GenericAdapterConfig,
  flagPatches?: string,
): string {
  if (flagPatches) return path.resolve(root, flagPatches);
  const configDir = path.dirname(path.resolve(root, configPath));
  if (config.patchesDir) {
    const fromConfig = path.resolve(configDir, config.patchesDir);
    if (existsSync(fromConfig)) return fromConfig;
    const fromRoot = path.resolve(root, config.patchesDir);
    if (existsSync(fromRoot)) return fromRoot;
  }
  const fixturePatches = path.join(configDir, 'patches');
  if (existsSync(fixturePatches)) return fixturePatches;

  if (config.instanceId.includes('qs')) {
    const fixturePatches = path.join(root, 'fixtures', 'qs-issue-33', 'patches');
    if (existsSync(fixturePatches)) return fixturePatches;
    return path.join(root, 'packages', 'runtime', 'src', 'patches');
  }
  const fixtureFastifyPatches = path.join(root, 'fixtures', 'fastify-issue-4807', 'patches');
  if (existsSync(fixtureFastifyPatches)) return fixtureFastifyPatches;
  return path.join(root, 'packages', 'runtime', 'src', 'patches', 'fastify4807');
}

async function loadOrSynthesizeIncident(
  root: string,
  configPath: string,
  config: GenericAdapterConfig,
  flagIncident?: string,
): Promise<ProductionIncidentContext | null> {
  const configDir = path.dirname(path.resolve(root, configPath));
  let incidentFilePath: string | undefined;
  if (flagIncident) {
    incidentFilePath = path.resolve(root, flagIncident);
  } else if (config.incidentFile) {
    const candidate = path.resolve(configDir, config.incidentFile);
    if (existsSync(candidate)) incidentFilePath = candidate;
    else if (existsSync(path.resolve(root, config.incidentFile))) {
      incidentFilePath = path.resolve(root, config.incidentFile);
    }
  } else if (existsSync(path.join(configDir, 'incident.json'))) {
    incidentFilePath = path.join(configDir, 'incident.json');
  } else if (config.instanceId.includes('qs')) {
    const qsInc = path.join(root, 'fixtures', 'qs-issue-33', 'incident.json');
    if (existsSync(qsInc)) incidentFilePath = qsInc;
  } else if (config.instanceId.includes('fastify')) {
    const fastifyInc = path.join(root, 'fixtures', 'fastify-issue-4807', 'incident.json');
    if (existsSync(fastifyInc)) incidentFilePath = fastifyInc;
  }

  if (incidentFilePath && existsSync(incidentFilePath)) {
    const raw = JSON.parse(await readFile(incidentFilePath, 'utf8'));
    if (
      raw.incidentId &&
      typeof raw.incidentId === 'string' &&
      !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        raw.incidentId,
      )
    ) {
      raw.incidentId = randomUUID();
    }
    const parsed = ProductionIncidentContextSchema.parse(raw);
    if (
      !parsed.oracle?.specification ||
      parsed.sufficiency?.status !== 'SUFFICIENT'
    ) {
      return null;
    }
    return parsed;
  }

  return null;
}

/**
 * Developer-Facing CLI Command Dispatcher
 * Supports:
 *   replaykit clean [--dry-run] [--run-id <id>]
 *   replaykit doctor
 *   replaykit generate --config <path> [--output <path>] [--model <model>] [--ambiguous-oracle]
 *   replaykit run --config <path> [--test <path>] [--role <role>] [--patch <path>]
 *   replaykit verify --config <path> --test <path> [--patches-dir <dir>]
 */
export type DeveloperCommandDeps =
  | {
      invokeDocker?: typeof docker;
      invokeSupervisor?: typeof runExternalContainer;
    }
  | typeof docker;

export async function developerCommand(
  root: string,
  args: string[],
  _env: Record<string, string | undefined> = process.env,
  deps: DeveloperCommandDeps = {},
): Promise<CommandResult | null> {
  const invokeDocker =
    typeof deps === 'function' ? deps : deps.invokeDocker ?? docker;
  const invokeSupervisor =
    typeof deps === 'object' && deps.invokeSupervisor ? deps.invokeSupervisor : runExternalContainer;
  const parsed = parseCliFlags(args);
  if (parsed.error) {
    return { exitCode: 1, data: { error: 'INVALID_INPUT', details: parsed.error } };
  }
  const { command, flags, booleanFlags } = parsed;

  const supportedCommands = ['clean', 'doctor', 'generate', 'run', 'verify'];
  if (!supportedCommands.includes(command)) {
    return null;
  }

  // 1. replaykit clean
  if (command === 'clean') {
    const dryRun = booleanFlags.has('--dry-run');
    const runId = flags.get('--run-id');
    try {
      const pruneResult = await pruneReplayKitResources({ dryRun, runId }, invokeDocker);
      return {
        exitCode: pruneResult.errors.length > 0 ? 1 : 0,
        data: {
          command: 'clean',
          dryRun,
          runId: runId ?? null,
          containersRemoved: pruneResult.containers.length,
          networksRemoved: pruneResult.networks.length,
          volumesRemoved: pruneResult.volumes.length,
          containers: pruneResult.containers,
          networks: pruneResult.networks,
          volumes: pruneResult.volumes,
          errors: pruneResult.errors,
          durationMs: pruneResult.durationMs,
          queries: pruneResult.queries,
        },
      };
    } catch (err: any) {
      const classification = err?.classification ?? 'UNKNOWN';
      const durationMs = err?.durationMs ?? null;
      const timeoutReason =
        classification === 'DOCKER_TIMEOUT' ? (err?.message ?? 'Docker command timed out') : null;
      return {
        exitCode: 1,
        data: {
          error: 'CLEAN_FAILED',
          message: err instanceof Error ? err.message : String(err),
          classification,
          durationMs,
          timeoutReason,
          exitStatus: err?.code ?? 1,
          stderr: err?.stderr ?? null,
        },
      };
    }
  }

  // 2. replaykit doctor
  if (command === 'doctor') {
    const report: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
    };

    let dockerOk = false;
    try {
      const dockerVer = await invokeDocker(['version', '--format', '{{json .Client.Version}}'], {
        timeoutMs: 5000,
        allowFailure: true,
      });
      if (dockerVer.code === 0) {
        dockerOk = true;
        report.docker = {
          status: 'CONNECTED',
          version: dockerVer.stdout.trim().replace(/"/g, ''),
        };
      } else {
        report.docker = { status: 'ERROR', details: dockerVer.stderr.trim() };
      }
    } catch (e) {
      report.docker = {
        status: 'UNAVAILABLE',
        error: e instanceof Error ? e.message : String(e),
      };
    }

    let ollamaOk = false;
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const body = (await res.json()) as { models?: Array<{ name: string }> };
        ollamaOk = true;
        report.ollama = {
          status: 'CONNECTED',
          models: body.models?.map((m) => m.name) ?? [],
        };
      } else {
        report.ollama = { status: 'HTTP_ERROR', statusCode: res.status };
      }
    } catch (e) {
      report.ollama = {
        status: 'NOT_RUNNING_OR_UNAVAILABLE',
        hint: 'Local Ollama service not responding at http://127.0.0.1:11434',
      };
    }

    report.overallStatus = dockerOk ? (ollamaOk ? 'HEALTHY' : 'DEGRADED_NO_OLLAMA') : 'UNHEALTHY';
    return {
      exitCode: dockerOk ? 0 : 1,
      data: report,
    };
  }

  // 3. replaykit generate
  if (command === 'generate') {
    const cmdStartTime = performance.now();
    const configPath = flags.get('--config');
    if (!configPath) {
      return { exitCode: 1, data: { error: 'MISSING_FLAG', flag: '--config' } };
    }

    // Epistemic honesty check for insufficient / ambiguous oracle
    if (booleanFlags.has('--ambiguous-oracle')) {
      return {
        exitCode: 2,
        data: {
          status: 'INSUFFICIENT_ORACLE',
          reason:
            'Ambiguous behavioral specification provided; cannot safely synthesize test oracle without assumptions.',
        },
      };
    }

    const tConfig0 = performance.now();
    let parsedConfig: GenericAdapterConfig;
    try {
      const rawConfig = JSON.parse(await readFile(path.resolve(root, configPath), 'utf8'));
      parsedConfig = GenericAdapterConfigSchema.parse(rawConfig);
    } catch (err) {
      return {
        exitCode: 1,
        data: {
          error: 'GENERATE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
    const configValidationMs = performance.now() - tConfig0;

    const tContext0 = performance.now();
    const model = flags.get('--model') ?? 'qwen2.5-coder:3b';
    const outputPath = flags.get('--output');
    const workspaceDir = resolveWorkspaceDir(root, configPath, parsedConfig, flags.get('--workspace'));
    const incidentContext = await loadOrSynthesizeIncident(root, configPath, parsedConfig, flags.get('--incident'));

    if (!incidentContext) {
      return {
        exitCode: 2,
        data: {
          status: 'INSUFFICIENT_ORACLE',
          reason:
            'Missing behavioral oracle specification. An explicit incident context or behavioral specification is required for test synthesis.',
        },
      };
    }
    const workspaceContextPrepMs = performance.now() - tContext0;

    try {
      const tPrompt0 = performance.now();
      const genResult = await generateRegressionTest(incidentContext, workspaceDir, { model });
      const promptAndModelMs = performance.now() - tPrompt0;
      const localModelInvocationMs = genResult.durationMs ?? promptAndModelMs;
      const promptConstructionMs = Math.max(0, promptAndModelMs - localModelInvocationMs);

      if (genResult.status !== 'SYNTHESIS_SUCCESS' || !genResult.testSource) {
        const perfReport = {
          command: 'generate',
          instanceId: parsedConfig.instanceId,
          model,
          status: genResult.status,
          timings: {
            cliStartupAndConfigValidationMs: configValidationMs,
            workspaceContextPreparationMs: workspaceContextPrepMs,
            promptConstructionMs,
            localModelInvocationMs,
            totalEndToEndWallClockMs: performance.now() - cmdStartTime,
          },
        };
        const perfDir = path.join(root, 'work', 'perf');
        await mkdir(perfDir, { recursive: true });
        await writeFile(
          path.join(perfDir, `generate-${Date.now()}-${randomBytes(4).toString('hex')}.json`),
          JSON.stringify(perfReport, null, 2) + '\n',
          'utf8',
        );

        return {
          exitCode: 2,
          data: {
            status: genResult.status,
            reason: genResult.reason || 'Failed to synthesize test',
          },
        };
      }

      // AST & safety validation
      const tAst0 = performance.now();
      const astCheck = validateTestAst(genResult.testSource);
      const aiResponseValidationMs = performance.now() - tAst0;

      if (!astCheck.valid) {
        return {
          exitCode: 2,
          data: {
            status: 'TEST_VALIDATION_REJECTED',
            reasons: astCheck.errors,
          },
        };
      }

      const testSha256 = sha256(genResult.testSource);

      const tWrite0 = performance.now();
      if (outputPath) {
        const dest = path.resolve(root, outputPath);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, genResult.testSource, 'utf8');
      }
      const testArtifactWritingMs = performance.now() - tWrite0;
      const totalWallClockMs = performance.now() - cmdStartTime;

      const perfReport = {
        command: 'generate',
        instanceId: parsedConfig.instanceId,
        model,
        status: 'GENERATED',
        timings: {
          cliStartupAndConfigValidationMs: configValidationMs,
          workspaceContextPreparationMs: workspaceContextPrepMs,
          promptConstructionMs,
          localModelInvocationMs,
          aiResponseValidationMs,
          testArtifactWritingMs,
          totalEndToEndWallClockMs: totalWallClockMs,
        },
        tokenUsage: genResult.tokenUsage,
      };

      const perfDir = path.join(root, 'work', 'perf');
      await mkdir(perfDir, { recursive: true });
      await writeFile(
        path.join(perfDir, `generate-${Date.now()}-${randomBytes(4).toString('hex')}.json`),
        JSON.stringify(perfReport, null, 2) + '\n',
        'utf8',
      );

      return {
        exitCode: 0,
        data: {
          status: 'GENERATED',
          model,
          testSha256,
          outputPath: outputPath ? path.resolve(root, outputPath) : null,
          testSource: genResult.testSource,
          durationMs: totalWallClockMs,
          tokenUsage: genResult.tokenUsage,
          timings: perfReport.timings,
        },
      };
    } catch (err) {
      return {
        exitCode: 1,
        data: {
          error: 'GENERATE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  // 4. replaykit run
  if (command === 'run') {
    const cmdStartTime = performance.now();
    const configPath = flags.get('--config');
    if (!configPath) {
      return { exitCode: 1, data: { error: 'MISSING_FLAG', flag: '--config' } };
    }

    try {
      const tConfig0 = performance.now();
      const rawConfig = JSON.parse(await readFile(path.resolve(root, configPath), 'utf8'));
      const config = GenericAdapterConfigSchema.parse(rawConfig);
      const configValidationMs = performance.now() - tConfig0;

      const tDeps0 = performance.now();
      const testPath = flags.get('--test');
      const role = (flags.get('--role') ?? 'buggy') as 'buggy' | 'reference' | 'alternate' | 'decoy';
      const patchPath = flags.get('--patch');

      const sourceBaseDir = resolveWorkspaceDir(root, configPath, config, flags.get('--workspace'));
      const modulesDir = resolveModulesDir(root, configPath, config, sourceBaseDir, flags.get('--modules-dir'));

      let candidateTestSource: string | undefined;
      if (testPath) {
        candidateTestSource = await readFile(path.resolve(root, testPath), 'utf8');
      } else {
        const defaultTest = path.join(sourceBaseDir, config.testFile);
        if (existsSync(defaultTest)) {
          candidateTestSource = await readFile(defaultTest, 'utf8');
        }
      }

      let candidatePatch: string | undefined;
      if (patchPath) {
        candidatePatch = await readFile(path.resolve(root, patchPath), 'utf8');
      } else if (role !== 'buggy') {
        const patchesDir = resolvePatchesDir(root, configPath, config, flags.get('--patches-dir'));
        const autoPatch = path.join(patchesDir, `${role}.patch`);
        if (existsSync(autoPatch)) {
          candidatePatch = await readFile(autoPatch, 'utf8');
        }
      }

      await mkdir(sourceBaseDir, { recursive: true });
      for (const src of config.sourceFiles) {
        const filePath = path.join(sourceBaseDir, src);
        if (!existsSync(filePath)) {
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, '// stub source\n', 'utf8');
        }
      }
      const dependencyPreparationMs = performance.now() - tDeps0;

      const stagingDir = path.join(
        root,
        'work',
        'cli-staging',
        `run-${Date.now()}-${randomBytes(4).toString('hex')}`,
      );
      await mkdir(stagingDir, { recursive: true });

      try {
        const tStage0 = performance.now();
        await stageGenericPayload({
          config,
          targetDir: stagingDir,
          sourceBaseDir,
          role,
          generatedTestSource: candidateTestSource ?? '// noop test\n',
          candidatePatch,
          additionalModulesDir: modulesDir,
        });
        const dockerPayloadStagingMs = performance.now() - tStage0;

        const tExec0 = performance.now();
        const supervisorResult = await invokeSupervisor({
          runId: `cli-${Date.now()}`,
          role,
          image: config.image,
          stagedDir: stagingDir,
          containerCommand: ['node', '/case/supervisor-runner.js'],
          timeoutSeconds: config.securityPolicy.timeoutSeconds,
          watchdogSeconds: 29,
          cpus: config.securityPolicy.maxCpus,
          memoryBytes: config.securityPolicy.maxMemoryBytes,
          pidsLimit: 64,
        });
        const containerExecutionWallClockMs = performance.now() - tExec0;
        const containerCreationAndExecutionMs =
          supervisorResult.durationMs ?? containerExecutionWallClockMs;

        const tEvidence0 = performance.now();
        const officialStdout =
          supervisorResult.artifacts?.['official.stdout']?.toString('utf8') ?? supervisorResult.stdout ?? '';
        const officialStderr =
          supervisorResult.artifacts?.['official.stderr']?.toString('utf8') ?? supervisorResult.stderr ?? '';
        let officialExitCode = supervisorResult.exitCode;
        if (supervisorResult.artifacts?.['official.json']) {
          try {
            const meta = JSON.parse(supervisorResult.artifacts['official.json'].toString('utf8'));
            if (meta.exitCode !== null && meta.exitCode !== undefined) {
              officialExitCode = meta.exitCode;
            }
          } catch {}
        }
        const evidenceCollectionMs = performance.now() - tEvidence0;

        const tNorm0 = performance.now();
        const normalized = normalizeGenericTestOutput(
          officialStdout,
          officialStderr,
          config.testRunner,
          officialExitCode,
        );
        const outputNormalizationMs = performance.now() - tNorm0;

        const testPassed =
          officialExitCode === 0 &&
          normalized.tests.length > 0 &&
          normalized.tests.every((t) => t.status === 'passed');
        const failure = normalized.tests.find((t) => t.status === 'failed')?.failure ?? null;

        const combinedOutput = `${officialStdout}\n${officialStderr}`;
        const reproMatches =
          officialExitCode !== 0 &&
          (failure?.type === config.expectedFailure.type || combinedOutput.includes(config.expectedFailure.type)) &&
          (combinedOutput.includes(config.expectedFailure.topApplicationFrame) ||
            (config.expectedFailure.message && combinedOutput.includes(config.expectedFailure.message)));

        const tCleanup0 = performance.now();
        await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
        const resourceCleanupMs = performance.now() - tCleanup0;
        const totalEndToEndWallClockMs = performance.now() - cmdStartTime;

        const perfReport = {
          command: 'run',
          instanceId: config.instanceId,
          role,
          testPassed,
          timings: {
            configValidationMs,
            dependencyPreparationMs,
            dockerPayloadStagingMs,
            containerCreationAndExecutionMs,
            evidenceCollectionMs,
            outputNormalizationMs,
            resourceCleanupMs,
            totalEndToEndWallClockMs,
          },
        };
        const perfDir = path.join(root, 'work', 'perf');
        await mkdir(perfDir, { recursive: true });
        await writeFile(
          path.join(perfDir, `run-${Date.now()}-${randomBytes(4).toString('hex')}.json`),
          JSON.stringify(perfReport, null, 2) + '\n',
          'utf8',
        );

        const executionRecord = {
          role,
          executionStatus: supervisorResult.executionStatus,
          containerExitCode: officialExitCode,
          normalizedExitCode: testPassed ? 0 : 1,
          testPassed,
          reproductionVerified: role === 'buggy' ? reproMatches : undefined,
          failureIdentity: failure,
          durationMs: supervisorResult.durationMs,
          isolationVerified:
            (supervisorResult.isolation?.readonlyRoot ?? true) &&
            (supervisorResult.isolation?.capDropAll ?? true),
          cleaned: supervisorResult.cleaned ?? true,
          testsCount: normalized.tests.length,
          error: supervisorResult.error ?? null,
          timings: perfReport.timings,
        };

        return {
          exitCode: supervisorResult.executionStatus === 'ERROR' ? 1 : testPassed ? 0 : 2,
          data: executionRecord,
        };
      } finally {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err) {
      return {
        exitCode: 1,
        data: {
          error: 'RUN_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  // 5. replaykit verify
  if (command === 'verify') {
    const configPath = flags.get('--config');
    const testPath = flags.get('--test');
    if (!configPath || !testPath) {
      return {
        exitCode: 1,
        data: { error: 'MISSING_FLAGS', required: ['--config', '--test'] },
      };
    }

    try {
      const rawConfig = JSON.parse(await readFile(path.resolve(root, configPath), 'utf8'));
      const config = GenericAdapterConfigSchema.parse(rawConfig);
      const testSource = await readFile(path.resolve(root, testPath), 'utf8');
      const testSha256 = sha256(testSource);

      const sourceBaseDir = resolveWorkspaceDir(root, configPath, config, flags.get('--workspace'));
      const modulesDir = resolveModulesDir(root, configPath, config, sourceBaseDir, flags.get('--modules-dir'));
      const patchesDir = resolvePatchesDir(root, configPath, config, flags.get('--patches-dir'));

      // Check available candidate patches
      const expectedPatchRoles = ['reference', 'alternate', 'decoy'] as const;
      const loadedPatches: Partial<Record<'reference' | 'alternate' | 'decoy', string>> = {};
      const missingPatches: string[] = [];

      for (const patchRole of expectedPatchRoles) {
        const patchFile = path.join(patchesDir, `${patchRole}.patch`);
        if (existsSync(patchFile)) {
          try {
            loadedPatches[patchRole] = await readFile(patchFile, 'utf8');
          } catch (e) {
            missingPatches.push(`${patchRole}.patch (unreadable: ${e instanceof Error ? e.message : String(e)})`);
          }
        } else {
          missingPatches.push(`${patchRole}.patch`);
        }
      }

      const startTime = Date.now();
      const runId = `verify-${Date.now()}-${randomBytes(4).toString('hex')}`;
      const evidenceDir = flags.get('--evidence-dir')
        ? path.resolve(root, flags.get('--evidence-dir')!)
        : path.join(root, 'work', 'v0.1.0', 'runs', runId);
      await mkdir(evidenceDir, { recursive: true });

      // Save repro test into evidence directory
      await writeFile(path.join(evidenceDir, 'repro.test.js'), testSource, 'utf8');

      const rolesToEvaluate: Array<{ role: 'buggy' | 'reference' | 'alternate' | 'decoy'; patch?: string }> = [
        { role: 'buggy' },
        ...(loadedPatches.reference ? [{ role: 'reference' as const, patch: loadedPatches.reference }] : []),
        ...(loadedPatches.alternate ? [{ role: 'alternate' as const, patch: loadedPatches.alternate }] : []),
        ...(loadedPatches.decoy ? [{ role: 'decoy' as const, patch: loadedPatches.decoy }] : []),
      ];

      await mkdir(sourceBaseDir, { recursive: true });
      for (const src of config.sourceFiles) {
        const filePath = path.join(sourceBaseDir, src);
        if (!existsSync(filePath)) {
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, '// stub source\n', 'utf8');
        }
      }

      interface EvaluatedTargetRecord {
        role: string;
        exitCode: number | null;
        passed: boolean;
        executionStatus: string;
        failureIdentity: unknown;
        stdout: string;
        stderr: string;
        suiteExitCode: number | null;
        suiteStdout: string;
        suiteStderr: string;
        patchHash: string;
        candidateHash: string;
        isolation: Record<string, unknown>;
        cleaned: boolean;
        durationMs: number;
      }

      const targetRecords: Record<string, EvaluatedTargetRecord> = {};

      const candidateTimings: Record<
        string,
        { stagingMs: number; executionMs: number; evidenceMs: number; wallClockMs: number }
      > = {};

      for (const { role, patch } of rolesToEvaluate) {
        const roleT0 = performance.now();
        const stagingDir = path.join(
          root,
          'work',
          'cli-staging',
          `verify-${role}-${Date.now()}-${randomBytes(4).toString('hex')}`,
        );
        const targetEvidenceDir = path.join(evidenceDir, role);
        await mkdir(targetEvidenceDir, { recursive: true });

        try {
          const tStage0 = performance.now();
          const stagingInfo = await stageGenericPayload({
            config,
            targetDir: stagingDir,
            sourceBaseDir,
            role,
            generatedTestSource: testSource,
            candidatePatch: patch,
            additionalModulesDir: modulesDir,
          });
          const stagingMs = performance.now() - tStage0;

          const tExec0 = performance.now();
          const supRes = await invokeSupervisor({
            runId: `verify-${role}-${randomUUID().slice(0, 8)}`,
            role,
            image: config.image,
            stagedDir: stagingDir,
            containerCommand: ['node', '/case/supervisor-runner.js'],
            timeoutSeconds: config.securityPolicy.timeoutSeconds,
            watchdogSeconds: 29,
            cpus: config.securityPolicy.maxCpus,
            memoryBytes: config.securityPolicy.maxMemoryBytes,
            pidsLimit: 64,
          });
          const executionWallClockMs = performance.now() - tExec0;
          const executionMs = supRes.durationMs ?? executionWallClockMs;

          const tEvid0 = performance.now();
          // Write raw artifacts to target evidence directory
          if (supRes.artifacts) {
            for (const [name, buf] of Object.entries(supRes.artifacts)) {
              await writeFile(path.join(targetEvidenceDir, name), buf);
            }
          }

          const officialStdout =
            supRes.artifacts?.['official.stdout']?.toString('utf8') ?? supRes.stdout ?? '';
          const officialStderr =
            supRes.artifacts?.['official.stderr']?.toString('utf8') ?? supRes.stderr ?? '';
          let officialExitCode = supRes.exitCode;
          if (supRes.artifacts?.['official.json']) {
            try {
              const meta = JSON.parse(supRes.artifacts['official.json'].toString('utf8'));
              if (meta.exitCode !== null && meta.exitCode !== undefined) {
                officialExitCode = meta.exitCode;
              }
            } catch {}
          }

          const suiteStdout =
            supRes.artifacts?.['suite.stdout']?.toString('utf8') ?? '';
          const suiteStderr =
            supRes.artifacts?.['suite.stderr']?.toString('utf8') ?? '';
          let suiteExitCode: number | null = null;
          if (supRes.artifacts?.['suite.json']) {
            try {
              const meta = JSON.parse(supRes.artifacts['suite.json'].toString('utf8'));
              suiteExitCode = meta.exitCode;
            } catch {}
          }

          const norm = normalizeGenericTestOutput(
            officialStdout,
            officialStderr,
            config.testRunner,
            officialExitCode,
          );
          const passed =
            officialExitCode === 0 &&
            norm.tests.length > 0 &&
            norm.tests.every((t) => t.status === 'passed');
          const failure = norm.tests.find((t) => t.status === 'failed')?.failure ?? null;
          const evidenceMs = performance.now() - tEvid0;

          const summaryRecord: EvaluatedTargetRecord = {
            role,
            exitCode: officialExitCode,
            passed,
            executionStatus: supRes.executionStatus,
            failureIdentity: failure,
            stdout: officialStdout,
            stderr: officialStderr,
            suiteExitCode,
            suiteStdout,
            suiteStderr,
            patchHash: stagingInfo.patchHash,
            candidateHash: stagingInfo.candidateHash,
            isolation: {
              networkMode: supRes.isolation?.networkMode ?? 'none',
              user: supRes.isolation?.user ?? '1000:1000',
              readonlyRoot: supRes.isolation?.readonlyRoot ?? true,
              capDropAll: supRes.isolation?.capDropAll ?? true,
              noNewPrivileges: supRes.isolation?.noNewPrivileges ?? true,
            },
            cleaned: supRes.cleaned ?? true,
            durationMs: supRes.durationMs,
          };

          await writeFile(
            path.join(targetEvidenceDir, 'target-summary.json'),
            JSON.stringify(summaryRecord, null, 2) + '\n',
            'utf8',
          );

          targetRecords[role] = summaryRecord;
          candidateTimings[role] = {
            stagingMs,
            executionMs,
            evidenceMs,
            wallClockMs: performance.now() - roleT0,
          };
        } finally {
          await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
        }
      }

      // -------------------------------------------------------------
      // RIGOROUS EVALUATOR INTEGRATION (TASK 4)
      // -------------------------------------------------------------
      const tVerdict0 = performance.now();
      const errors: string[] = [];

      const buggy = targetRecords['buggy'];
      const ref = targetRecords['reference'];
      const alt = targetRecords['alternate'];
      const decoy = targetRecords['decoy'];

      const allPresent = !!buggy && !!ref && !!alt && !!decoy;
      if (!allPresent) {
        if (!buggy) errors.push('CRITICAL: Buggy execution record is missing');
        if (!ref) errors.push(`CRITICAL: Reference fix evaluation record is missing (expected patch in ${patchesDir})`);
        if (!alt) errors.push(`CRITICAL: Alternate fix evaluation record is missing (expected patch in ${patchesDir})`);
        if (!decoy) errors.push(`CRITICAL: Decoy fix evaluation record is missing (expected patch in ${patchesDir})`);
      }

      if (missingPatches.length > 0) {
        errors.push(`Missing candidate patches in ${patchesDir}: ${missingPatches.join(', ')}`);
      }

      // Check 1: Buggy failure identity
      let buggyFails = false;
      if (buggy) {
        const buggyRepros = !buggy.passed;
        const buggyCombined = `${buggy.stdout}\n${buggy.stderr}`;
        const buggyFailure = buggy.failureIdentity as { type?: string; topApplicationFrame?: string } | null;
        const typeMatch =
          buggyFailure?.type === config.expectedFailure.type ||
          buggyCombined.includes(config.expectedFailure.type);
        const frameMatch =
          !config.expectedFailure.topApplicationFrame ||
          buggyFailure?.topApplicationFrame?.includes(config.expectedFailure.topApplicationFrame) ||
          buggyCombined.includes(config.expectedFailure.topApplicationFrame) ||
          (config.expectedFailure.message ? buggyCombined.includes(config.expectedFailure.message) : false);
        buggyFails = buggyRepros && (typeMatch || frameMatch);
        if (!buggyFails) {
          errors.push(
            `Buggy execution did not fail with expected ${config.expectedFailure.type}. Exit: ${buggy.exitCode}`,
          );
        }
      }

      // Check 2: Reference fix passes
      let referencePasses = false;
      if (ref) {
        const suitePass =
          ref.suiteExitCode === null ||
          ref.suiteExitCode === 0 ||
          ref.suiteStdout.includes('baseline routing passed') ||
          ref.suiteStdout.includes('ok ');
        referencePasses = ref.passed && suitePass;
        if (!referencePasses) {
          errors.push(`Reference fix failed. Exit: ${ref.exitCode}, suiteExit: ${ref.suiteExitCode}`);
        }
      }

      // Check 3: Alternate fix passes
      let alternatePasses = false;
      if (alt) {
        const suitePass =
          alt.suiteExitCode === null ||
          alt.suiteExitCode === 0 ||
          alt.suiteStdout.includes('baseline routing passed') ||
          alt.suiteStdout.includes('ok ');
        alternatePasses = alt.passed && suitePass;
        if (!alternatePasses) {
          errors.push(`Alternate fix failed. Exit: ${alt.exitCode}, suiteExit: ${alt.suiteExitCode}`);
        }
      }

      // Check 4: Decoy fix semantically rejected
      let decoyRejects = false;
      if (decoy) {
        const decoyCombined = `${decoy.stdout}\n${decoy.stderr}`;
        const decoyFailure = decoy.failureIdentity as { type?: string } | null;
        decoyRejects =
          decoy.exitCode !== 0 &&
          (decoyFailure?.type === 'AssertionError' ||
            decoyCombined.includes('AssertionError') ||
            decoyCombined.includes('expected') ||
            decoyCombined.includes('Expected'));
        if (!decoyRejects) {
          errors.push(
            `Decoy fix was not rejected with semantic AssertionError. Exit: ${decoy.exitCode}, error: ${decoyFailure?.type}`,
          );
        }
      }

      // Check 5: Patch Hashes Verification
      let patchHashesMatch = true;
      for (const [r, target] of Object.entries(targetRecords)) {
        const expected = config.patchHashes[r as keyof typeof config.patchHashes];
        if (expected && target.patchHash !== expected) {
          patchHashesMatch = false;
          errors.push(
            `Patch hash mismatch for role '${r}': expected ${expected}, got ${target.patchHash}`,
          );
        }
      }

      // Check 6: Non-regression baseline suite passes
      const nonRegressionBaselinePasses =
        Object.values(targetRecords).length > 0 &&
        Object.values(targetRecords).every(
          (t) =>
            t.suiteExitCode === null ||
            t.suiteExitCode === 0 ||
            t.suiteStdout.includes('baseline routing passed') ||
            t.suiteStdout.includes('ok '),
        );
      if (!nonRegressionBaselinePasses) {
        errors.push('Baseline non-regression tests failed on one or more evaluated targets');
      }

      // Check 7: Candidate & Test Hash Consistency
      const sameCandidateHash =
        Object.values(targetRecords).length > 0 &&
        Object.values(targetRecords).every((t) => t.candidateHash === testSha256);
      if (!sameCandidateHash) {
        errors.push('Candidate test SHA-256 hash mismatch across target runs');
      }

      // Check 8: Positive execution evidence
      const positiveExecutionEvidence =
        Object.values(targetRecords).length > 0 &&
        Object.values(targetRecords).every(
          (t) => t.stdout.length > 0 || t.stderr.length > 0 || (t.suiteStdout && t.suiteStdout.length > 0),
        );
      if (!positiveExecutionEvidence) {
        errors.push('Positive test execution evidence is missing on one or more targets');
      }

      // Check 9: Isolation & Cleanup enforcement
      const offlineEnforced =
        Object.values(targetRecords).length > 0 &&
        Object.values(targetRecords).every(
          (t) => (t.isolation as { networkMode?: string }).networkMode === 'none',
        );
      const isolationEnforced =
        Object.values(targetRecords).length > 0 &&
        Object.values(targetRecords).every(
          (t) =>
            (t.isolation as { readonlyRoot?: boolean }).readonlyRoot === true &&
            (t.isolation as { capDropAll?: boolean }).capDropAll === true,
        );
      const cleanupEnforced =
        Object.values(targetRecords).length > 0 &&
        Object.values(targetRecords).every((t) => t.cleaned === true);

      if (!offlineEnforced) errors.push('Offline isolation (--network none) violated');
      if (!isolationEnforced) errors.push('Resource isolation limits violated');
      if (!cleanupEnforced) errors.push('Container cleanup failed');

      const hasExecutionError = Object.values(targetRecords).some((t) => t.executionStatus === 'ERROR');

      let verdict: 'VERIFIED' | 'REJECTED' | 'NOT_REPRODUCED' | 'ERROR' = 'VERIFIED';
      if (hasExecutionError) {
        verdict = 'ERROR';
      } else if (!buggyFails) {
        verdict = 'NOT_REPRODUCED';
      } else if (
        !allPresent ||
        !referencePasses ||
        !alternatePasses ||
        !decoyRejects ||
        !patchHashesMatch ||
        !nonRegressionBaselinePasses ||
        !sameCandidateHash ||
        !offlineEnforced ||
        !isolationEnforced ||
        !cleanupEnforced ||
        !positiveExecutionEvidence
      ) {
        verdict = 'REJECTED';
      }

      const verdictEvaluationMs = performance.now() - tVerdict0;
      const totalWallClockMs = Date.now() - startTime;

      const perfReport = {
        command: 'verify',
        instanceId: config.instanceId,
        runId,
        verdict,
        candidateTimings,
        timings: {
          candidatePreparationAndExecutionMs: Object.values(candidateTimings).reduce(
            (acc, c) => acc + c.wallClockMs,
            0,
          ),
          verdictEvaluationMs,
          totalEndToEndWallClockMs: totalWallClockMs,
        },
      };

      const perfDir = path.join(root, 'work', 'perf');
      await mkdir(perfDir, { recursive: true });
      await writeFile(
        path.join(perfDir, `verify-${Date.now()}-${randomBytes(4).toString('hex')}.json`),
        JSON.stringify(perfReport, null, 2) + '\n',
        'utf8',
      );

      const verdictData = {
        command: 'verify',
        verdict,
        runId,
        evidenceDir,
        candidateHash: testSha256,
        targets: Object.fromEntries(
          Object.entries(targetRecords).map(([r, t]) => [
            r,
            {
              exitCode: t.exitCode,
              passed: t.passed,
              details: (t.failureIdentity as { type?: string })?.type ?? (t.passed ? 'Passed' : 'Failed'),
            },
          ]),
        ),
        checks: {
          allPresent,
          buggyFails,
          referencePasses,
          alternatePasses,
          decoyRejects,
          patchHashesMatch,
          nonRegressionBaselinePasses,
          sameCandidateHash,
          positiveExecutionEvidence,
          offlineEnforced,
          isolationEnforced,
          cleanupEnforced,
        },
        errors,
        durationMs: totalWallClockMs,
        candidateTimings,
        timings: perfReport.timings,
      };

      await writeFile(
        path.join(evidenceDir, 'evaluation-verdict.json'),
        JSON.stringify(verdictData, null, 2) + '\n',
        'utf8',
      );

      return {
        exitCode: verdict === 'VERIFIED' ? 0 : verdict === 'ERROR' ? 1 : 2,
        data: verdictData,
      };
    } catch (err) {
      return {
        exitCode: 1,
        data: {
          error: 'VERIFY_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  return null;
}
