import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { incidentFixture } from '../../contracts/src/fixtures.js';
import { planIncident } from '../../planner/src/index.js';
import { verifyPlan } from './workflow.js';

it('redacts normalized incidents before persistence and before provenance validation', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'replaykit-privacy-'));
  const incident = {
    ...incidentFixture(),
    request: undefined,
    telemetryTier: 'partial' as const,
    missingEvidence: ['request.body'],
    metadata: { password: 'do-not-persist-me' },
  };
  const sanitized = { ...incident, metadata: { password: '[REDACTED]' } };
  await verifyPlan(process.cwd(), output, incident, planIncident(sanitized));
  expect(await readFile(path.join(output, 'incident.json'), 'utf8')).not.toContain(
    'do-not-persist-me',
  );
});
