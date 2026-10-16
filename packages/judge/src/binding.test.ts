import { describe, expect, it } from 'vitest';
import { incidentFixture } from '../../contracts/src/fixtures.js';
import { planIncident } from '../../planner/src/index.js';
import { replayBindingIssues, candidateStateError } from './binding.js';
const incident = incidentFixture();
const plan = planIncident(incident);
describe('review regressions: execution and input provenance', () => {
  it('rejects a request substituted without changing the incident hash', () => {
    expect(
      replayBindingIssues(
        incident,
        { ...plan, request: { ...plan.request!, amount: 42 } },
        incident.revision,
      ),
    ).toContain('PLAN_REQUEST_MISMATCH');
  });
  it('rejects invented request values for minimal evidence', () => {
    expect(
      replayBindingIssues(
        {
          ...incident,
          request: undefined,
          telemetryTier: 'minimal',
          breadcrumbs: [],
          spans: [],
          missingEvidence: ['request.body'],
        },
        plan,
        incident.revision,
      ),
    ).toContain('PLAN_REQUEST_MISMATCH');
  });
  it('requires the exact buggy image revision and supported service', () => {
    expect(replayBindingIssues(incident, plan, 'another-image')).toContain('UNSUPPORTED_REVISION');
    expect(
      replayBindingIssues({ ...incident, service: 'unrelated' }, plan, incident.revision),
    ).toContain('UNSUPPORTED_SERVICE');
    expect(replayBindingIssues(incident, plan, incident.revision)).toEqual([]);
  });
  it('classifies OOM, signals, startup failures and incomplete state as infrastructure errors', () => {
    expect(
      candidateStateError({
        Status: 'exited',
        Running: false,
        OOMKilled: true,
        Error: '',
        ExitCode: 137,
      }),
    ).toBe('CANDIDATE_OOM');
    expect(
      candidateStateError({
        Status: 'exited',
        Running: false,
        OOMKilled: false,
        Error: '',
        ExitCode: 137,
      }),
    ).toBe('CANDIDATE_PROCESS_ERROR');
    expect(
      candidateStateError({
        Status: 'created',
        Running: false,
        OOMKilled: false,
        Error: 'start failed',
        ExitCode: 0,
      }),
    ).not.toBeNull();
    expect(candidateStateError({})).not.toBeNull();
    expect(
      candidateStateError({
        Status: 'exited',
        Running: false,
        OOMKilled: false,
        Error: '',
        ExitCode: 1,
      }),
    ).toBeNull();
  });
});
