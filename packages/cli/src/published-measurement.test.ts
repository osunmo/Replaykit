import { describe, expect, it } from 'vitest';
import { publishMeasurement } from './published-measurement.js';

const runId = '4b6b3d90-cc54-4bf6-9a5c-9faf860fbe12';
const hash = 'a'.repeat(64);
const image = `sha256:${hash}`;
const stats = { count: 10, sumMs: 250, meanMs: 25, maxMs: 50 };
const aggregate = { executionCount: 10, wallMs: stats, stages: { postgresStartup: stats } };
const measurement = {
  runId,
  label: 'optimized-concurrency-3',
  startedAt: '2026-10-16T21:00:00.000Z',
  wallMs: 12345.67,
  concurrencyRequested: 3,
  manifest: {
    nodeImage: image,
    postgresImage: image,
    candidateImage: image,
    plannerImage: image,
    appImages: { buggy: image, reference: image, alternate: image, decoy: image },
    sourceHashes: { buggy: hash },
  },
  host: {
    platform: 'win32',
    arch: 'x64',
    node: 'v22.23.3',
    logicalCpus: 8,
    totalMemoryBytes: 16 * 1024 ** 3,
  },
  stages: {
    capture: aggregate,
    matrix: aggregate,
    byVariant: { buggy: aggregate },
    unclassified: { executionCount: 0 },
    missingProfileRunIds: [],
  },
  resourceSampling: {
    peakActiveLabeledContainers: 9,
    peakAggregateCpuPercent: 252.3,
    peakAggregateMemoryBytes: 22222222,
    errors: [],
  },
  summary: { status: 'PASS', wrongFrameRejected: true, missingBodyAbstained: true },
};
const result = {
  runId,
  status: 'VERIFIED',
  checks: {
    buggyFails: true,
    sameFailureIdentity: true,
    referenceFixPasses: true,
    alternateFixPasses: true,
    decoyFixStillFails: true,
    deterministicRuns: 10,
    deterministicFailures: 10,
    offlineExecution: true,
    isolatedExecution: true,
    freshState: true,
    noSleepBasedTiming: true,
    reviewableTest: true,
    sameCandidate: true,
  },
  metadata: {
    candidateHash: hash,
    referenceFixAttempts: 3,
    referenceFixSuccesses: 3,
    alternateFixAttempts: 3,
    alternateFixSuccesses: 3,
  },
};

describe('portable published measurement projection', () => {
  it('publishes validated future provenance without backfilling historical measurements', () => {
    const provenance = {
      schemaVersion: 1,
      capturedAt: '2026-10-17T00:00:00.000Z',
      hashAlgorithm: 'sha256',
      applicationSourceHash: hash,
      controllerSourceHash: hash,
      judgeSourceHash: hash,
      sdkSourceHash: hash,
      plannerSourceHash: hash,
      lockfileHash: hash,
      git: { status: 'AVAILABLE', commit: 'b'.repeat(40), dirty: true },
      runtime: { postgresMode: 'initdb', fsync: 'on', concurrency: 3 },
      images: {
        nodeImage: image,
        postgresImage: image,
        candidateImage: image,
        plannerImage: image,
        appImages: { buggy: image, reference: image, alternate: image, decoy: image },
      },
    };
    expect(
      publishMeasurement(
        { ...measurement, manifest: { ...measurement.manifest, provenance } },
        result,
      ).provenance,
    ).toEqual(provenance);
    expect(publishMeasurement(measurement, result)).not.toHaveProperty('provenance');
    expect(() =>
      publishMeasurement(
        {
          ...measurement,
          manifest: {
            ...measurement.manifest,
            provenance: { ...provenance, token: 'secret-canary' },
          },
        },
        result,
      ),
    ).toThrow();
    expect(() =>
      publishMeasurement(
        {
          ...measurement,
          manifest: {
            ...measurement.manifest,
            provenance: { ...provenance, controllerSourceHash: '/private/file' },
          },
        },
        result,
      ),
    ).toThrow();
  });

  it('preserves sanitized PostgreSQL runtime provenance and leaves absent or invalid fields unknown', () => {
    const runtime = {
      mode: 'template-copy',
      baseImage: image,
      templateSourceHash: hash,
      schemaHash: hash,
      fsync: 'on',
    };
    const published = publishMeasurement(
      { ...measurement, manifest: { ...measurement.manifest, postgresRuntime: runtime } },
      result,
    );
    expect(published.images.postgresRuntime).toEqual(runtime);
    const absent = publishMeasurement(measurement, result);
    expect(absent.images.postgresRuntime).toEqual({
      mode: null,
      baseImage: null,
      templateSourceHash: null,
      schemaHash: null,
      fsync: null,
    });
    const malformed = publishMeasurement(
      {
        ...measurement,
        manifest: {
          ...measurement.manifest,
          postgresRuntime: {
            mode: 'C:\\private\\mode',
            baseImage: 'postgres:latest',
            templateSourceHash: 'private-host-path',
            schemaHash: '../../secret',
            fsync: 'disabled',
            credential: 'private-password',
          },
        },
      },
      result,
    );
    expect(malformed.images.postgresRuntime).toEqual(absent.images.postgresRuntime);
    expect(JSON.stringify(malformed)).not.toContain('private');
    expect(
      publishMeasurement(
        {
          ...measurement,
          manifest: {
            ...measurement.manifest,
            postgresRuntime: { mode: 'initdb', baseImage: image, fsync: 'off' },
          },
        },
        result,
      ).images.postgresRuntime,
    ).toMatchObject({ mode: 'initdb', fsync: 'off' });
  });

  it('preserves explicit sampling modes and does not infer a mode for older measurements', () => {
    const unsampled = publishMeasurement(
      {
        ...measurement,
        resourceSampling: {
          enabled: false,
          mode: 'off',
          intervalMs: null,
          commandTimeoutMs: null,
          containerCountSamples: 0,
          cpuSamples: 0,
          memorySamples: 0,
          peakActiveLabeledContainers: null,
          peakAggregateCpuPercent: null,
          peakAggregateMemoryBytes: null,
          samples: [],
          errors: [],
        },
      },
      result,
    );
    expect(unsampled.resources).toEqual({
      enabled: false,
      mode: 'off',
      intervalMs: null,
      commandTimeoutMs: null,
      containerCountSamples: 0,
      cpuSamples: 0,
      memorySamples: 0,
      peakActiveLabeledContainers: null,
      peakAggregateCpuPercent: null,
      peakAggregateMemoryBytes: null,
      sampleCount: 0,
      samplerErrorCount: 0,
    });
    const sampled = publishMeasurement(
      {
        ...measurement,
        resourceSampling: { ...measurement.resourceSampling, enabled: true, mode: 'on' },
      },
      result,
    );
    expect(sampled.resources).toMatchObject({ enabled: true, mode: 'on' });
    expect(publishMeasurement(measurement, result).resources).toMatchObject({
      enabled: null,
      mode: null,
    });
  });

  it('publishes engine capacity and independent observer coverage while preserving unavailable baseline fields', () => {
    const observed = publishMeasurement(
      {
        ...measurement,
        dockerEngineCapacity: { logicalCpus: 6, totalMemoryBytes: 8 * 1024 ** 3 },
        resourceSampling: {
          ...measurement.resourceSampling,
          containerCountSamples: 23,
          cpuSamples: 17,
          memorySamples: 0,
        },
      },
      result,
    );
    expect(observed.dockerEngineCapacity).toEqual({ cpuCount: 6, totalMemoryBytes: 8 * 1024 ** 3 });
    expect(observed.resources).toMatchObject({
      containerCountSamples: 23,
      cpuSamples: 17,
      memorySamples: 0,
    });
    const baseline = publishMeasurement(measurement, result);
    expect(baseline.dockerEngineCapacity).toEqual({ cpuCount: null, totalMemoryBytes: null });
    expect(baseline.resources).toMatchObject({
      containerCountSamples: null,
      cpuSamples: null,
      memorySamples: null,
    });
  });

  it('preserves numeric measurements, strict judge gates, repeat counts, and immutable identifiers', () => {
    const published = publishMeasurement(measurement, result, {
      concurrency: 3,
      wallMs: 12000,
      matrixWallMs: 11000,
      maxActiveExecutions: 3,
      fixRepetitions: 3,
    });
    expect(published.wallMs).toBe(12345.67);
    expect(published.stages.matrix.stages.postgresStartup).toEqual(stats);
    expect(published.judge.checks).toEqual(result.checks);
    expect(published.judge.referenceFixAttempts).toBe(3);
    expect(published.judge.candidateHash).toBe(hash);
    expect(published.images.appImages.buggy).toBe(image);
    expect(published.sources.measurement).toBe(`runs/${runId}/measurement.json`);
    expect(published.pipeline?.matrixWallMs).toBe(11000);
    expect(published.resources.peakAggregateCpuPercent).toBe(252.3);
  });

  it('excludes arbitrary fields, paths, credentials, raw Docker data, and error messages at every level', () => {
    const secret = 'password-super-secret';
    const absolute = 'C:\\Users\\private-person\\local-run';
    const injected = {
      ...measurement,
      label: `${absolute} ${secret}`,
      arbitrary: secret,
      host: {
        ...measurement.host,
        cpuModel: secret,
        hostname: secret,
        cwd: absolute,
        node: secret,
      },
      manifest: {
        ...measurement.manifest,
        appImages: { ...measurement.manifest.appImages, decoy: secret },
        environment: { DATABASE_URL: secret },
      },
      stages: {
        ...measurement.stages,
        matrix: {
          ...aggregate,
          stages: { postgresStartup: { ...stats, localPath: absolute }, [absolute]: stats },
        },
      },
      resourceSampling: {
        ...measurement.resourceSampling,
        samples: [{ raw: { Env: secret, Mounts: absolute } }],
        errors: [{ message: `${absolute} ${secret}` }],
      },
      artifactErrors: [secret],
      failure: `${absolute} ${secret}`,
    };
    const published = publishMeasurement(
      injected,
      { ...result, metadata: { ...result.metadata, arbitrary: secret }, localPath: absolute },
      { concurrency: 3, executionTimeline: [{ secret }], environment: secret },
    );
    const serialized = JSON.stringify(published);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('private-person');
    expect(serialized).not.toContain('DATABASE_URL');
    expect(serialized).not.toContain('samples');
    expect(published.label).toBe('measurement');
    expect(published.resources.samplerErrorCount).toBe(1);
    expect(published.artifactErrorCount).toBe(1);
    expect(published.measurementFailed).toBe(true);
    expect(published.images.appImages.decoy).toBeNull();
  });

  it('rejects path-like and mismatched run IDs before constructing source references', () => {
    expect(() => publishMeasurement({ ...measurement, runId: '../../private' }, result)).toThrow(
      'UUID',
    );
    expect(() =>
      publishMeasurement(measurement, { ...result, runId: 'b3c2ab4a-2577-489f-94ac-f8be168a1712' }),
    ).toThrow('mismatch');
  });

  it('supports original baseline artifacts without fabricating fix pass counts or pipeline timings', () => {
    const published = publishMeasurement(
      {
        ...measurement,
        stages: {
          ...measurement.stages,
          byVariant: {
            reference: { ...aggregate, executionCount: 1 },
            alternate: { ...aggregate, executionCount: 1 },
          },
        },
      },
      { ...result, metadata: { candidateHash: hash } },
    );
    expect(published.judge.referenceFixAttempts).toBe(1);
    expect(published.judge.referenceFixSuccesses).toBeNull();
    expect(published.pipeline).toBeNull();
  });
});
