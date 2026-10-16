import { expect, it } from 'vitest';
import { StageProfiler } from './profiling.js';

it('records exclusive monotonic stages and retains failed work before cleanup', () => {
  let now = 0;
  const profiler = new StageProfiler(() => now);
  profiler.begin('networkCreation');
  now = 12;
  profiler.begin('postgresStartup');
  now = 32;
  profiler.fail();
  profiler.begin('cleanup');
  now = 40;
  const profile = profiler.finish();
  expect(profile.wallMs).toBe(40);
  expect(profile.stages).toEqual([
    { stage: 'networkCreation', offsetMs: 0, durationMs: 12, status: 'COMPLETED' },
    { stage: 'postgresStartup', offsetMs: 12, durationMs: 20, status: 'ERROR' },
    { stage: 'cleanup', offsetMs: 32, durationMs: 8, status: 'COMPLETED' },
  ]);
});

it('retains repeated stage segments rather than losing earlier elapsed work', () => {
  let now = 5;
  const profiler = new StageProfiler(() => now);
  profiler.begin('evidenceCollection');
  now = 10;
  profiler.begin('resourceObservation');
  now = 13;
  profiler.begin('evidenceCollection');
  now = 17;
  const profile = profiler.finish();
  expect(profile.stages.map((s) => s.durationMs)).toEqual([5, 3, 4]);
  expect(profile.wallMs).toBe(12);
});
