import { createHash } from 'node:crypto';
import { IncidentSchema, ReplayPlanSchema, type ReplayPlan } from '../../contracts/src/index.js';

/** Pure evidence adapter: no filesystem, process, network, model key or answer-key access. */
export function planIncident(input: unknown): ReplayPlan {
  const incident = IncidentSchema.parse(input);
  const base = {
    schemaVersion: 1 as const,
    incidentId: incident.id,
    missingEvidence: [...incident.missingEvidence],
    assumptions: [] as string[],
    sourceHash: createHash('sha256').update(JSON.stringify(incident)).digest('hex'),
  };
  const abstain = (reason: string) =>
    ReplayPlanSchema.parse({ ...base, status: 'ABSTAIN', testSource: null, reasonCodes: [reason] });
  if (!incident.request) return abstain('MISSING_REQUEST_BODY');
  const request = incident.request;
  const attempts = incident.breadcrumbs.filter(
    (item) =>
      item.category === 'payment' &&
      item.message === 'provider-charge' &&
      item.data?.clientKey === request.idempotencyKey &&
      item.data?.orderId === request.orderId &&
      item.data?.amount === request.amount,
  );
  const providerKeys = new Set(
    attempts.map((item) => item.data?.providerKey).filter((key) => typeof key === 'string'),
  );
  if (attempts.length < 2 || providerKeys.size < 2)
    return abstain('MISSING_RETRY_KEY_DRIFT_EVIDENCE');
  if (incident.exception.type !== 'DuplicatePaymentError')
    return abstain('UNSUPPORTED_FAILURE_CATEGORY');
  const testSource = [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { payment, chargeCount } from '/sdk/replay-fixture.mjs';",
    '',
    "test('repeated payment keeps one charge per idempotency key', async () => {",
    `  const request = ${JSON.stringify(request)};`,
    '  await payment(request);',
    '  await payment(request);',
    '  assert.equal(await chargeCount(request.orderId), 1);',
    '});',
    '',
  ].join('\n');
  return ReplayPlanSchema.parse({
    ...base,
    status: 'READY',
    request,
    testSource,
    reasonCodes: [],
    assumptions: [
      'The synthetic provider and payment request represent the observed payment contract.',
    ],
  });
}
