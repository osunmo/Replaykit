import { RunProvenanceSchema } from './provenance.js';

const variants = ['buggy', 'reference', 'alternate', 'decoy'] as const;
const stageNames = [
  'preparation',
  'networkCreation',
  'postgresStartup',
  'postgresReadiness',
  'applicationStartup',
  'applicationReadiness',
  'candidatePreparation',
  'candidateExecution',
  'evidenceCollection',
  'errorEvidence',
  'cleanup',
  'artifactWrite',
] as const;
const gateNames = [
  'buggyFails',
  'sameFailureIdentity',
  'referenceFixPasses',
  'alternateFixPasses',
  'decoyFixStillFails',
  'offlineExecution',
  'isolatedExecution',
  'freshState',
  'noSleepBasedTiming',
  'reviewableTest',
  'sameCandidate',
] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function count(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}
function boolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
function match(value: unknown, pattern: RegExp): string | null {
  return typeof value === 'string' && pattern.test(value) ? value : null;
}
function enumeration(value: unknown, allowed: readonly string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null;
}
function length(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
function statistics(value: unknown) {
  const raw = object(value);
  return {
    count: count(raw.count),
    sumMs: number(raw.sumMs),
    meanMs: number(raw.meanMs),
    maxMs: number(raw.maxMs),
  };
}
function aggregate(value: unknown) {
  const raw = object(value);
  const stages = object(raw.stages);
  return {
    executionCount: count(raw.executionCount),
    wallMs: statistics(raw.wallMs),
    stages: Object.fromEntries(
      stageNames
        .filter((name) => Object.hasOwn(stages, name))
        .map((name) => [name, statistics(stages[name])]),
    ),
  };
}
function timestamp(value: unknown) {
  const text = match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
  return text !== null && Number.isFinite(Date.parse(text)) ? text : null;
}

/** Explicit publication projection: raw execution artifacts must never be copied wholesale. */
export function publishMeasurement(measurement: unknown, result: unknown, pipeline?: unknown) {
  const measured = object(measurement);
  const judged = object(result);
  const runId = match(measured.runId, uuid);
  if (!runId) throw new Error('Measurement requires a UUID runId');
  if (judged.runId !== runId) throw new Error('Measurement/result runId mismatch');
  const metadata = object(judged.metadata);
  const checks = object(judged.checks);
  const host = object(measured.host);
  const dockerCapacity = object(measured.dockerEngineCapacity);
  const manifest = object(measured.manifest);
  const postgresRuntime = object(manifest.postgresRuntime);
  const appImages = object(manifest.appImages);
  const sourceHashes = object(manifest.sourceHashes);
  const stages = object(measured.stages);
  const byVariant = object(stages.byVariant);
  const resources = object(measured.resourceSampling);
  const smoke = object(measured.summary);
  const flow = object(pipeline);
  const imagePattern = /^sha256:[a-f0-9]{64}$/;
  const hashPattern = /^[a-f0-9]{64}$/;
  return {
    schemaVersion: 1,
    runId,
    label: match(measured.label, /^[a-z][a-z0-9-]{0,63}$/) ?? 'measurement',
    startedAt: timestamp(measured.startedAt),
    wallMs: number(measured.wallMs),
    concurrencyRequested: count(measured.concurrencyRequested),
    ...(manifest.provenance === undefined
      ? {}
      : { provenance: RunProvenanceSchema.parse(manifest.provenance) }),
    sources: {
      measurement: `runs/${runId}/measurement.json`,
      result: `runs/${runId}/result.json`,
      ...(pipeline === undefined ? {} : { pipeline: `runs/${runId}/pipeline.json` }),
    },
    machine: {
      platform: enumeration(host.platform, [
        'win32',
        'linux',
        'darwin',
        'freebsd',
        'openbsd',
        'aix',
        'sunos',
        'android',
      ]),
      architecture: enumeration(host.arch, [
        'x64',
        'arm64',
        'ia32',
        'arm',
        'ppc64',
        's390x',
        'riscv64',
        'loong64',
      ]),
      node: match(host.node, /^v\d+\.\d+\.\d+$/),
      logicalCpus: count(host.logicalCpus),
      totalMemoryBytes: count(host.totalMemoryBytes),
    },
    dockerEngineCapacity: {
      cpuCount: count(dockerCapacity.logicalCpus),
      totalMemoryBytes: count(dockerCapacity.totalMemoryBytes),
    },
    images: {
      nodeImage: match(manifest.nodeImage, imagePattern),
      postgresImage: match(manifest.postgresImage, imagePattern),
      postgresRuntime: {
        mode: enumeration(postgresRuntime.mode, ['initdb', 'template-copy']),
        baseImage: match(postgresRuntime.baseImage, imagePattern),
        templateSourceHash: match(postgresRuntime.templateSourceHash, hashPattern),
        schemaHash: match(postgresRuntime.schemaHash, hashPattern),
        fsync: enumeration(postgresRuntime.fsync, ['on', 'off']),
      },
      candidateImage: match(manifest.candidateImage, imagePattern),
      plannerImage: match(manifest.plannerImage, imagePattern),
      appImages: Object.fromEntries(
        variants.map((variant) => [variant, match(appImages[variant], imagePattern)]),
      ),
      sourceHashes: Object.fromEntries(
        variants.map((variant) => [variant, match(sourceHashes[variant], hashPattern)]),
      ),
    },
    stages: {
      capture: aggregate(stages.capture),
      matrix: aggregate(stages.matrix),
      byVariant: Object.fromEntries(
        variants.map((variant) => [variant, aggregate(byVariant[variant])]),
      ),
      unclassified: aggregate(stages.unclassified),
      missingProfileCount: length(stages.missingProfileRunIds),
    },
    judge: {
      status: enumeration(judged.status, ['VERIFIED', 'PARTIAL', 'NOT_REPRODUCED', 'ERROR']),
      checks: {
        ...Object.fromEntries(gateNames.map((name) => [name, boolean(checks[name])])),
        deterministicRuns: count(checks.deterministicRuns),
        deterministicFailures: count(checks.deterministicFailures),
      },
      referenceFixAttempts:
        count(metadata.referenceFixAttempts) ?? count(object(byVariant.reference).executionCount),
      referenceFixSuccesses: count(metadata.referenceFixSuccesses),
      alternateFixAttempts:
        count(metadata.alternateFixAttempts) ?? count(object(byVariant.alternate).executionCount),
      alternateFixSuccesses: count(metadata.alternateFixSuccesses),
      decoyAttempts: count(object(byVariant.decoy).executionCount),
      candidateHash: match(metadata.candidateHash, hashPattern),
      incidentHash: match(metadata.incidentHash, hashPattern),
    },
    smoke: {
      status: enumeration(smoke.status, ['PASS', 'FAIL']),
      wrongFrameRejected: boolean(smoke.wrongFrameRejected),
      missingBodyAbstained: boolean(smoke.missingBodyAbstained),
    },
    pipeline:
      pipeline === undefined
        ? null
        : {
            concurrency: count(flow.concurrency),
            fixRepetitions: count(flow.fixRepetitions),
            wallMs: number(flow.wallMs),
            matrixWallMs: number(flow.matrixWallMs),
            maxActiveExecutions: count(flow.maxActiveExecutions),
          },
    resources: {
      enabled: boolean(resources.enabled),
      mode: enumeration(resources.mode, ['on', 'off']),
      containerCountSamples: count(resources.containerCountSamples),
      cpuSamples: count(resources.cpuSamples),
      memorySamples: count(resources.memorySamples),
      peakActiveLabeledContainers: count(resources.peakActiveLabeledContainers),
      peakAggregateCpuPercent: number(resources.peakAggregateCpuPercent),
      peakAggregateMemoryBytes: number(resources.peakAggregateMemoryBytes),
      sampleCount: length(resources.samples),
      samplerErrorCount: length(resources.errors),
      intervalMs: number(resources.intervalMs),
      commandTimeoutMs: number(resources.commandTimeoutMs),
    },
    artifactErrorCount: length(measured.artifactErrors),
    measurementFailed: typeof measured.failure === 'string' && measured.failure.length > 0,
  };
}
