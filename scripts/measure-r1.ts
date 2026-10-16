import { spawn } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  aggregateProfiles,
  loadMeasuredEnvironment,
  parseDockerStats,
  summarizeResourceSamples,
  type ProfileInput,
} from '../packages/cli/src/measurement.js';
import { newOutput, smoke } from '../packages/cli/src/workflow.js';

const args = process.argv.slice(2);
function option(name: string, fallback?: string) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing ${name}`);
  return value;
}
const label = option('--label', 'measurement')!;
const concurrency = Number(option('--concurrency', '3'));
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10)
  throw new Error('Concurrency must be an integer from 1 to 10');
const root = process.cwd();
const output = await newOutput(root);
const abort = new AbortController();

// A separately bounded observer; its outputs are never accepted as judge evidence.
async function observeDocker(command: string[], timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', command, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abort.signal.removeEventListener('abort', cancel);
      if (error) {
        child.kill();
        reject(error);
      } else resolve(stdout);
    };
    const cancel = () => finish(new Error('SAMPLER_STOPPED'));
    const timer = setTimeout(
      () => finish(new Error(`Sampler command timeout: ${command[0]}`)),
      timeoutMs,
    );
    abort.signal.addEventListener('abort', cancel, { once: true });
    if (abort.signal.aborted) cancel();
    child.on('error', (error) => finish(error));
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 1024 * 1024) finish(new Error('Sampler output limit'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 65536) finish(new Error('Sampler stderr limit'));
    });
    child.on('close', (code) =>
      finish(
        code === 0
          ? undefined
          : new Error(`Sampler Docker ${command[0]} exit ${code}: ${stderr.trim()}`),
      ),
    );
  });
}
function pause(ms: number) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      abort.signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    abort.signal.addEventListener('abort', finish, { once: true });
    if (abort.signal.aborted) finish();
  });
}
type Sample = {
  offsetMs: number;
  activeContainers: number;
  ids: string[];
  stats: ReturnType<typeof parseDockerStats>;
};
const samples: Sample[] = [];
const samplerErrors: { offsetMs: number; message: string }[] = [];
let dockerEngineCapacity: { logicalCpus: number; totalMemoryBytes: number } | null = null;
let dockerEngineCapacityError: string | null = null;
try {
  // Capacity is captured once before the timed pipeline and before periodic sampling starts.
  const info = JSON.parse(await observeDocker(['info', '--format', '{{json .}}'])) as {
    NCPU?: unknown;
    MemTotal?: unknown;
  };
  if (
    typeof info.NCPU !== 'number' ||
    !Number.isInteger(info.NCPU) ||
    info.NCPU <= 0 ||
    typeof info.MemTotal !== 'number' ||
    !Number.isSafeInteger(info.MemTotal) ||
    info.MemTotal <= 0
  )
    throw new Error('Docker did not report valid CPU and memory capacity');
  dockerEngineCapacity = { logicalCpus: info.NCPU, totalMemoryBytes: info.MemTotal };
} catch (error) {
  dockerEngineCapacityError = error instanceof Error ? error.message : String(error);
}
const startedAt = new Date().toISOString();
const started = performance.now();
const sampler = (async () => {
  while (!abort.signal.aborted) {
    const sampleStart = performance.now();
    try {
      const ids = (
        await observeDocker(['ps', '--filter', 'label=replaykit.run', '--format', '{{.ID}}'])
      )
        .split(/\r?\n/)
        .filter(Boolean);
      const sample: Sample = {
        offsetMs: performance.now() - started,
        activeContainers: ids.length,
        ids,
        stats: [],
      };
      samples.push(sample);
      if (ids.length)
        sample.stats = parseDockerStats(
          await observeDocker(['stats', '--no-stream', '--format', '{{json .}}', ...ids]),
        );
    } catch (error) {
      if (!abort.signal.aborted)
        samplerErrors.push({
          offsetMs: performance.now() - started,
          message: error instanceof Error ? error.message : String(error),
        });
    }
    if (!abort.signal.aborted) await pause(Math.max(0, 5000 - (performance.now() - sampleStart)));
  }
})();
let summary: unknown = null;
let failure: string | null = null;
let pipelineWallMs = 0;
try {
  const measuredSmoke = smoke as (
    root: string,
    output: string,
    options: { concurrency: number },
  ) => Promise<unknown>;
  summary = await measuredSmoke(root, output, { concurrency });
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  pipelineWallMs = performance.now() - started;
  abort.abort();
  await sampler;
}
async function optionalJson(relative: string, fallback: unknown) {
  try {
    return JSON.parse(await readFile(path.join(output, relative), 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}
const profiles: ProfileInput[] = [];
const artifactErrors: string[] = [];
let executions: string[] = [];
try {
  executions = await readdir(path.join(output, 'executions'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') artifactErrors.push(String(error));
}
for (const runId of executions) {
  try {
    const profile = (await optionalJson(`executions/${runId}/profile.json`, null)) as
      ProfileInput['profile'] | null;
    if (profile) profiles.push({ runId, profile });
  } catch (error) {
    artifactErrors.push(`${runId}: ${String(error)}`);
  }
}
const capture = await optionalJson('capture.json', null);
const matrix = (await optionalJson('matrix.json', {})) as Record<string, unknown>;
let manifest: unknown = null;
try {
  manifest = await loadMeasuredEnvironment(output);
  if (manifest === null) artifactErrors.push('manifest: measured environment.json is unavailable');
} catch (error) {
  artifactErrors.push(`manifest: ${String(error)}`);
}
const measurement = {
  schemaVersion: 1,
  label,
  startedAt,
  wallMs: pipelineWallMs,
  concurrencyRequested: concurrency,
  runId: path.basename(output),
  summary,
  failure,
  host: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    osRelease: os.release(),
    logicalCpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtEnd: os.freemem(),
    processMemoryAtEnd: process.memoryUsage(),
  },
  dockerEngineCapacity,
  dockerEngineCapacityError,
  manifest,
  stages: aggregateProfiles(profiles, capture, matrix),
  resourceSampling: {
    intervalMs: 5000,
    commandTimeoutMs: 8000,
    ...summarizeResourceSamples(samples),
    samples,
    errors: samplerErrors,
    limitations:
      'Samples include all running replaykit.run-labeled containers, can miss short-lived peaks, and observer commands add overhead. CPU/memory peaks use complete valid stats samples only; null means unavailable, with valid sample counts provided. CPU percent sums across cores; no sampler result establishes a judge gate.',
  },
  artifactErrors,
};
await writeFile(path.join(output, 'measurement.json'), JSON.stringify(measurement, null, 2) + '\n');
process.stdout.write(
  JSON.stringify(
    {
      label,
      wallMs: pipelineWallMs,
      summary,
      failure,
      measurement: path
        .relative(root, path.join(output, 'measurement.json'))
        .split(path.sep)
        .join('/'),
    },
    null,
    2,
  ) + '\n',
);
if (failure || (summary as { status?: string } | null)?.status !== 'PASS') process.exitCode = 1;
