import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Only the environment saved by the measured verification is authoritative. */
export async function loadMeasuredEnvironment(output: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path.join(output, 'environment.json'), 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export interface ProfileInput {
  runId: string;
  profile: { wallMs: number; stages: { stage: string; durationMs: number }[] };
}
interface Statistics {
  count: number;
  sumMs: number;
  meanMs: number | null;
  maxMs: number | null;
}
function statistics(values: number[]): Statistics {
  const sumMs = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    sumMs,
    meanMs: values.length ? sumMs / values.length : null,
    maxMs: values.length ? Math.max(...values) : null,
  };
}
function summarize(profiles: ProfileInput[]) {
  const stages: Record<string, number[]> = {};
  for (const { profile } of profiles) {
    for (const item of profile.stages) {
      if (!Number.isFinite(item.durationMs) || item.durationMs < 0)
        throw new Error('Invalid stage duration');
      (stages[item.stage] ??= []).push(item.durationMs);
    }
  }
  return {
    executionCount: profiles.length,
    wallMs: statistics(profiles.map(({ profile }) => profile.wallMs)),
    stages: Object.fromEntries(
      Object.entries(stages).map(([name, values]) => [name, statistics(values)]),
    ),
  };
}
function runIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(runIds);
  if (value && typeof value === 'object' && 'runId' in value && typeof value.runId === 'string')
    return [value.runId];
  return [];
}
export function aggregateProfiles(
  profiles: ProfileInput[],
  capture: unknown,
  matrix: Record<string, unknown>,
) {
  const captureIds = new Set(runIds(capture));
  const variantIds = Object.fromEntries(
    Object.entries(matrix).map(([variant, value]) => [variant, new Set(runIds(value))]),
  );
  const matrixIds = new Set(Object.values(variantIds).flatMap((ids) => [...ids]));
  const knownIds = new Set([...captureIds, ...matrixIds]);
  const foundIds = new Set(profiles.map((item) => item.runId));
  return {
    capture: summarize(profiles.filter((item) => captureIds.has(item.runId))),
    matrix: summarize(profiles.filter((item) => matrixIds.has(item.runId))),
    byVariant: Object.fromEntries(
      Object.entries(variantIds).map(([variant, ids]) => [
        variant,
        summarize(profiles.filter((item) => ids.has(item.runId))),
      ]),
    ),
    unclassified: summarize(profiles.filter((item) => !knownIds.has(item.runId))),
    missingProfileRunIds: [...knownIds].filter((id) => !foundIds.has(id)),
    note: 'Stage sums and execution wall sums overlap under parallel execution; use top-level wallMs for elapsed pipeline time.',
  };
}
function memoryBytes(value: string): number | null {
  const match = /^\s*([\d.]+)\s*(B|kB|KB|MB|GB|TB|KiB|MiB|GiB|TiB)\s*$/.exec(value);
  if (!match) return null;
  const powers: Record<string, number> = {
    B: 1,
    kB: 1e3,
    KB: 1e3,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
  };
  return Number(match[1]) * powers[match[2]!]!;
}
export function parseDockerStats(output: string) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const raw = JSON.parse(line) as Record<string, string>;
      const [used = '', limit = ''] = (raw.MemUsage ?? '').split('/');
      const cpu = Number.parseFloat(raw.CPUPerc ?? '');
      const pids = Number.parseInt(raw.PIDs ?? '', 10);
      return {
        name: raw.Name ?? '',
        id: raw.ID ?? raw.Container ?? '',
        cpuPercent: Number.isFinite(cpu) ? cpu : null,
        memoryBytes: memoryBytes(used),
        memoryLimitBytes: memoryBytes(limit),
        pids: Number.isFinite(pids) ? pids : null,
        raw,
      };
    });
}

/** Missing or partial stats samples cannot establish a resource peak. */
export function summarizeResourceSamples(
  samples: readonly {
    activeContainers: number;
    stats: ReturnType<typeof parseDockerStats>;
  }[],
) {
  const cpu: number[] = [];
  const memory: number[] = [];
  const valid = (value: number | null): value is number =>
    value !== null && Number.isFinite(value) && value >= 0;
  for (const sample of samples) {
    if (!sample.stats.length || sample.stats.length !== sample.activeContainers) continue;
    const cpus = sample.stats.map((stat) => stat.cpuPercent);
    const memories = sample.stats.map((stat) => stat.memoryBytes);
    if (cpus.every(valid)) cpu.push(cpus.reduce((sum, value) => sum + value, 0));
    if (memories.every(valid)) memory.push(memories.reduce((sum, value) => sum + value, 0));
  }
  const peak = (values: number[]) => (values.length ? Math.max(...values) : null);
  return {
    containerCountSamples: samples.length,
    cpuSamples: cpu.length,
    memorySamples: memory.length,
    peakActiveLabeledContainers: peak(samples.map((sample) => sample.activeContainers)),
    peakAggregateCpuPercent: peak(cpu),
    peakAggregateMemoryBytes: peak(memory),
  };
}
