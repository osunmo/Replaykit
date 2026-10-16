import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  aggregateProfiles,
  loadMeasuredEnvironment,
  parseDockerStats,
  summarizeResourceSamples,
} from './measurement.js';

const temporaryRoots: string[] = [];
afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (
      path.dirname(root) !== path.resolve(tmpdir()) ||
      !path.basename(root).startsWith('rk-measure-')
    )
      throw new Error('Refusing to remove an unexpected test directory');
    await rm(root, { recursive: true, force: true });
  }
});

async function recordedEnvironmentFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'rk-measure-'));
  temporaryRoots.push(root);
  const output = path.join(root, 'runs', 'measured');
  await mkdir(output, { recursive: true });
  await mkdir(path.join(root, 'work', 'sandbox'), { recursive: true });
  await writeFile(
    path.join(root, 'work', 'sandbox', 'manifest.json'),
    JSON.stringify({ image: 'rebuilt' }),
  );
  return output;
}

describe('measurement aggregation', () => {
  it('keeps capture costs separate from matrix costs and preserves repeated fix runs', () => {
    const profiles = [
      { runId: 'capture', profile: { wallMs: 7, stages: [{ stage: 'network', durationMs: 3 }] } },
      {
        runId: 'buggy-1',
        profile: {
          wallMs: 10,
          stages: [
            { stage: 'network', durationMs: 4 },
            { stage: 'cleanup', durationMs: 2 },
          ],
        },
      },
      {
        runId: 'reference-1',
        profile: { wallMs: 20, stages: [{ stage: 'network', durationMs: 6 }] },
      },
      {
        runId: 'reference-2',
        profile: { wallMs: 30, stages: [{ stage: 'network', durationMs: 8 }] },
      },
    ];
    const result = aggregateProfiles(
      profiles,
      { runId: 'capture' },
      {
        buggy: [{ runId: 'buggy-1' }],
        reference: [{ runId: 'reference-1' }, { runId: 'reference-2' }],
      },
    );
    expect(result.capture.stages.network).toEqual({ count: 1, sumMs: 3, meanMs: 3, maxMs: 3 });
    expect(result.matrix.stages.network).toEqual({ count: 3, sumMs: 18, meanMs: 6, maxMs: 8 });
    expect(result.matrix.executionCount).toBe(3);
    expect(result.byVariant.reference?.executionCount).toBe(2);
    expect(result.matrix.wallMs.sumMs).toBe(60);
    expect(result.unclassified.executionCount).toBe(0);
  });

  it('records missing profiles without disguising incomplete measurements as zero cost', () => {
    const result = aggregateProfiles([], { runId: 'capture' }, { buggy: [{ runId: 'missing' }] });
    expect(result.missingProfileRunIds).toEqual(['capture', 'missing']);
    expect(result.matrix.wallMs.meanMs).toBeNull();
    expect(result.matrix.stages).toEqual({});
  });

  it('parses CPU percent and binary memory units without dropping original samples', () => {
    const result = parseDockerStats(
      '{"Name":"rk-test","CPUPerc":"134.20%","MemUsage":"12.5MiB / 256MiB","PIDs":"8"}\n',
    );
    expect(result[0]).toMatchObject({
      name: 'rk-test',
      cpuPercent: 134.2,
      memoryBytes: 13107200,
      memoryLimitBytes: 268435456,
      pids: 8,
    });
    expect(result[0]?.raw.MemUsage).toBe('12.5MiB / 256MiB');
    expect(() => parseDockerStats('not JSON')).toThrow();
  });
});

describe('resource sample summary', () => {
  it('reports unavailable peaks when there are no resource observations', () => {
    expect(summarizeResourceSamples([])).toEqual({
      containerCountSamples: 0,
      cpuSamples: 0,
      memorySamples: 0,
      peakActiveLabeledContainers: null,
      peakAggregateCpuPercent: null,
      peakAggregateMemoryBytes: null,
    });
  });

  it('does not turn failed stats calls into zero CPU or memory use', () => {
    expect(summarizeResourceSamples([{ activeContainers: 3, stats: [] }])).toEqual({
      containerCountSamples: 1,
      cpuSamples: 0,
      memorySamples: 0,
      peakActiveLabeledContainers: 3,
      peakAggregateCpuPercent: null,
      peakAggregateMemoryBytes: null,
    });
  });

  it('only aggregates complete valid observations and counts CPU and memory separately', () => {
    const complete = parseDockerStats(
      '{"CPUPerc":"134.20%","MemUsage":"12MiB / 256MiB"}\n' +
        '{"CPUPerc":"0%","MemUsage":"8MiB / 256MiB"}\n',
    );
    const missingCpu = parseDockerStats('{"MemUsage":"21MiB / 256MiB"}\n');
    const incomplete = parseDockerStats('{"CPUPerc":"900%","MemUsage":"200MiB / 256MiB"}\n');
    const invalid = parseDockerStats('{"CPUPerc":"-1%","MemUsage":"invalid"}\n');
    expect(
      summarizeResourceSamples([
        { activeContainers: 2, stats: complete },
        { activeContainers: 1, stats: missingCpu },
        { activeContainers: 2, stats: incomplete },
        { activeContainers: 1, stats: invalid },
      ]),
    ).toEqual({
      containerCountSamples: 4,
      cpuSamples: 1,
      memorySamples: 2,
      peakActiveLabeledContainers: 2,
      peakAggregateCpuPercent: 134.2,
      peakAggregateMemoryBytes: 21 * 1024 ** 2,
    });
  });

  it('preserves genuinely observed zeroes', () => {
    const stats = parseDockerStats('{"CPUPerc":"0%","MemUsage":"0B / 256MiB"}\n');
    expect(summarizeResourceSamples([{ activeContainers: 1, stats }])).toMatchObject({
      cpuSamples: 1,
      memorySamples: 1,
      peakAggregateCpuPercent: 0,
      peakAggregateMemoryBytes: 0,
    });
  });
});

describe('recorded measurement environment', () => {
  it('uses the images saved with the run even when the root manifest changed', async () => {
    const output = await recordedEnvironmentFixture();
    const recorded = { image: 'actually-executed', hostNode: 'v22' };
    await writeFile(path.join(output, 'environment.json'), JSON.stringify(recorded));
    expect(await loadMeasuredEnvironment(output)).toEqual(recorded);
  });

  it('reports unknown environment rather than falling back to a current root manifest', async () => {
    const output = await recordedEnvironmentFixture();
    expect(await loadMeasuredEnvironment(output)).toBeNull();
  });
});
