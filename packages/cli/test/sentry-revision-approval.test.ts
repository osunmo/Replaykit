import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { integrationCommand } from '../src/integration-command.js';
import {
  approveRevision,
  loadSupportedRevisions,
  saveImportedIncident,
  inspectImportedIncident,
  importedIncident,
} from '../src/sentry-imports.js';
import { triggerSyntheticSentryDemo } from '../src/sentry-demo.js';
import { normalizeSentryEvent } from '../../sentry/src/normalize.js';
import { SentryImportError } from '../../sentry/src/errors.js';
import { JudgeResultSchema } from '../../contracts/src/index.js';
import { SupportedRevisionsSchema } from '../../sentry/src/schemas.js';

const roots: string[] = [];
async function createTestRoot() {
  const p = await mkdtemp(path.join(tmpdir(), 'replaykit-rev-'));
  roots.push(p);
  // Ensure sandbox manifest is present so valid approvals can be processed
  await mkdir(path.join(p, 'work/sandbox'), { recursive: true });
  await cp(
    path.join(process.cwd(), 'work/sandbox/manifest.json'),
    path.join(p, 'work/sandbox/manifest.json'),
  );
  return p;
}

afterEach(async () => {
  for (const p of roots.splice(0)) {
    await rm(p, { recursive: true, force: true });
  }
});

function realEventShape(release = 'checkout-r1-synthetic') {
  return {
    eventID: '7292def780e1444fbc903d992a2a8c56',
    groupID: '7797314628',
    dateCreated: '2026-10-17T08:07:22.947Z',
    release: { version: release },
    projectID: '4512270492958720',
    projectSlug: 'replaykit-checkout',
    entries: [
      {
        type: 'exception',
        data: {
          values: [
            {
              type: 'DuplicatePaymentError',
              value: 'Repeated idempotency key produced more than one provider charge',
              stacktrace: {
                frames: [
                  {
                    filename: 'app:///apps/checkout-api/src/payments.js',
                    function: 'createPayment',
                    in_app: true,
                    lineno: 42,
                  },
                ],
              },
            },
          ],
        },
      },
      {
        type: 'request',
        data: {
          data: {
            orderId: 'order-synthetic-58ade25c',
            idempotencyKey: 'client-key-8c772dca-c8b',
            amount: 2999,
          },
        },
      },
      {
        type: 'breadcrumbs',
        data: {
          values: [
            {
              category: 'payment',
              message: 'provider-charge',
              data: {
                clientKey: 'client-key-8c772dca-c8b',
                providerKey: 'payment-0000000003',
                orderId: 'order-synthetic-58ade25c',
                amount: 2999,
              },
            },
            {
              category: 'payment',
              message: 'provider-charge',
              data: {
                clientKey: 'client-key-8c772dca-c8b',
                providerKey: 'payment-0000000004',
                orderId: 'order-synthetic-58ade25c',
                amount: 2999,
              },
            },
          ],
        },
      },
    ],
    contexts: {
      trace: {
        trace_id: '0cde1e86c96d44faaccb1e5e0c677d04',
      },
    },
    _meta: { entries: {} },
  };
}

const realLocation = {
  origin: 'https://mimi-yq.sentry.io',
  organization: 'mimi-yq',
  issueId: '7797314628',
  eventId: '7292def780e1444fbc903d992a2a8c56',
};

describe('Sentry revision approval regression controls', () => {
  it('1. Running incident sentry-demo with an unapproved release does not modify work/sentry/supported-revisions.json', async () => {
    const p = await createTestRoot();
    const initialApproved = [
      {
        release: 'checkout-r1-synthetic',
        service: 'checkout-api' as const,
        revision: 'sha256:fa1ef32671960f9c17eb43a3855373242298a2f813638793a98a998b9f0a695b',
        applicationSourceHash: '50b41d2d2fc70070229c89ff5aae005d5a74a99e2b9b6ab84840116e7c196999',
      },
    ];
    await mkdir(path.join(p, 'work/sentry'), { recursive: true });
    await writeFile(
      path.join(p, 'work/sentry/supported-revisions.json'),
      JSON.stringify(initialApproved, null, 2) + '\n',
    );
    const initialJson = await readFile(
      path.join(p, 'work/sentry/supported-revisions.json'),
      'utf8',
    );

    // Run incident sentry-demo via CLI integrationCommand with an unapproved release
    const unapprovedRelease = 'checkout-r1-unapproved-sample';
    await integrationCommand(
      p,
      [
        'incident',
        'sentry-demo',
        '--release',
        unapprovedRelease,
        '--dsn',
        `https://${'a'.repeat(32)}@o1.ingest.sentry.io/42`,
      ],
      {},
    );

    // Verify file content on disk is completely unmodified
    const afterCliJson = await readFile(
      path.join(p, 'work/sentry/supported-revisions.json'),
      'utf8',
    );
    expect(afterCliJson).toBe(initialJson);
    const revisionsAfterCli = await loadSupportedRevisions(p);
    expect(revisionsAfterCli).toEqual(initialApproved);
    expect(revisionsAfterCli.some((r) => r.release === unapprovedRelease)).toBe(false);

    // Also verify direct call to triggerSyntheticSentryDemo does not approve or mutate
    await expect(
      triggerSyntheticSentryDemo(p, {
        SENTRY_RELEASE: 'another-unapproved-sample',
        SENTRY_DSN: `https://${'a'.repeat(32)}@o1.ingest.sentry.io/42`,
      }),
    ).rejects.toThrow();

    const finalJson = await readFile(path.join(p, 'work/sentry/supported-revisions.json'), 'utf8');
    expect(finalJson).toBe(initialJson);
    const finalRevisions = await loadSupportedRevisions(p);
    expect(finalRevisions).toEqual(initialApproved);
    expect(finalRevisions.some((r) => r.release === 'another-unapproved-sample')).toBe(false);
  });

  it('2. A real event with an unapproved release is rejected by import with UNSUPPORTED_REVISION', async () => {
    const p = await createTestRoot();
    const supportedRevisions = [
      {
        release: 'checkout-r1-synthetic',
        service: 'checkout-api' as const,
        revision: 'sha256:fa1ef32671960f9c17eb43a3855373242298a2f813638793a98a998b9f0a695b',
        applicationSourceHash: '50b41d2d2fc70070229c89ff5aae005d5a74a99e2b9b6ab84840116e7c196999',
      },
    ];
    await mkdir(path.join(p, 'work/sentry'), { recursive: true });
    await writeFile(
      path.join(p, 'work/sentry/supported-revisions.json'),
      JSON.stringify(supportedRevisions, null, 2) + '\n',
    );
    const diskRevisions = await loadSupportedRevisions(p);

    // Real event with an unapproved release
    const rawUnapproved = realEventShape('unapproved-production-release-123');

    // Rejection by normalizeSentryEvent using on-disk supported revisions
    expect(() => normalizeSentryEvent(rawUnapproved, realLocation, diskRevisions)).toThrowError(
      new SentryImportError('UNSUPPORTED_REVISION'),
    );

    // Rejection when supportedRevisions list is empty
    expect(() =>
      normalizeSentryEvent(realEventShape('checkout-r1-synthetic'), realLocation, []),
    ).toThrowError(new SentryImportError('UNSUPPORTED_REVISION'));
  });

  it('3. Explicitly approved releases still import successfully', async () => {
    const p = await createTestRoot();
    const newRelease = 'checkout-r1-operator-approved';

    // 1. Operator explicitly approves the release via CLI command
    const approveResult = await integrationCommand(
      p,
      ['incident', 'approve-revision', '--release', newRelease],
      {},
    );
    expect(approveResult?.exitCode).toBe(0);
    expect(approveResult?.data).toMatchObject({
      release: newRelease,
      service: 'checkout-api',
      revision: 'sha256:fa1ef32671960f9c17eb43a3855373242298a2f813638793a98a998b9f0a695b',
    });

    const currentRevisions = await loadSupportedRevisions(p);
    expect(currentRevisions.some((r) => r.release === newRelease)).toBe(true);

    // 2. Import event matching the newly approved release
    const rawEvent = realEventShape(newRelease);
    const normalized = normalizeSentryEvent(rawEvent, realLocation, currentRevisions);
    expect(normalized.incident.revision).toBe(
      'sha256:fa1ef32671960f9c17eb43a3855373242298a2f813638793a98a998b9f0a695b',
    );
    expect(normalized.provenance.release).toBe(newRelease);
    expect(normalized.summary.release).toBe(newRelease);

    // 3. Save imported incident to disk and verify access
    const saved = await saveImportedIncident(p, normalized);
    expect(saved.artifact).toBe(`runs/imports/${saved.importId}/incident.json`);
    const retrieved = await importedIncident(p, saved.importId);
    expect(retrieved.id).toBe('7292def780e1444fbc903d992a2a8c56');
    expect(retrieved.exception.type).toBe('DuplicatePaymentError');
  });

  it('4. An approved release cannot be rebound to a different revision', async () => {
    const p = await createTestRoot();
    const releaseToBind = 'checkout-r1-stable-release';

    // 1. Initial explicit approval
    const firstApproval = await approveRevision(p, releaseToBind);
    expect(firstApproval.release).toBe(releaseToBind);

    // Re-approving the EXACT SAME release and revision is idempotent
    const identicalReapproval = await approveRevision(p, releaseToBind);
    expect(identicalReapproval).toEqual(firstApproval);

    // 2. Tamper with the sandbox manifest so that a re-approval attempts to bind to a different image revision
    const manifestPath = path.join(p, 'work/sandbox/manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.appImages.buggy = `sha256:${'9'.repeat(64)}`;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    // 3. Attempting to rebind the approved release to a different revision must fail via approveRevision
    await expect(approveRevision(p, releaseToBind)).rejects.toThrow('RELEASE_REBINDING_REJECTED');

    // 4. Also verify failure through the operator CLI interface
    const cliRebind = await integrationCommand(
      p,
      ['incident', 'approve-revision', '--release', releaseToBind],
      {},
    );
    expect(cliRebind?.exitCode).toBe(1);
    expect(cliRebind?.data).toHaveProperty('error', 'RELEASE_REBINDING_REJECTED');

    // 5. Verify the on-disk supported-revisions.json entry was NOT overwritten
    const stored = await loadSupportedRevisions(p);
    const entry = stored.find((r) => r.release === releaseToBind);
    expect(entry?.revision).toBe(firstApproval.revision);
    expect(entry?.revision).not.toBe(`sha256:${'9'.repeat(64)}`);
  });

  it('5. Previously imported events and existing VERIFIED reports remain unchanged', async () => {
    const root = process.cwd();

    // 1. Verify workspace supported-revisions.json is valid and contains checkout-r1-synthetic
    const supportedRevisions = await loadSupportedRevisions(root);
    expect(SupportedRevisionsSchema.safeParse(supportedRevisions).success).toBe(true);
    const r1Synthetic = supportedRevisions.find((r) => r.release === 'checkout-r1-synthetic');
    expect(r1Synthetic).toBeDefined();
    expect(r1Synthetic?.revision).toBe(
      'sha256:fa1ef32671960f9c17eb43a3855373242298a2f813638793a98a998b9f0a695b',
    );
    expect(r1Synthetic?.applicationSourceHash).toBe(
      '50b41d2d2fc70070229c89ff5aae005d5a74a99e2b9b6ab84840116e7c196999',
    );

    // 2. Verify existing imported incident d9c0f9ce-9e17-4e29-8dc8-147698d0680e
    const importId = 'd9c0f9ce-9e17-4e29-8dc8-147698d0680e';
    const inspected = await inspectImportedIncident(root, importId);
    expect(inspected.importId).toBe(importId);
    expect(inspected.summary.exceptionType).toBe('DuplicatePaymentError');
    expect(inspected.summary.release).toBe('checkout-r1-synthetic');
    expect(inspected.provenance.normalizedIncidentHash).toBe(
      '6f7fbcb28a4ae6f07101d1f0fc570d57462b1f2c09122c89a47ad2e12215d08e',
    );

    const incident = await importedIncident(root, importId);
    const incidentHash = createHash('sha256').update(JSON.stringify(incident)).digest('hex');
    expect(incidentHash).toBe('6f7fbcb28a4ae6f07101d1f0fc570d57462b1f2c09122c89a47ad2e12215d08e');

    // 3. Verify existing VERIFIED report ff3f2772-2269-4e6f-a21a-e33f15f3fa6a
    const verifiedRunId = 'ff3f2772-2269-4e6f-a21a-e33f15f3fa6a';
    const resultRaw = await readFile(path.join(root, 'runs', verifiedRunId, 'result.json'), 'utf8');
    const result = JudgeResultSchema.parse(JSON.parse(resultRaw));
    expect(result.status).toBe('VERIFIED');
    expect(result.incidentId).toBe('7292def780e1444fbc903d992a2a8c56');
    expect(result.checks.buggyFails).toBe(true);
    expect(result.checks.referenceFixPasses).toBe(true);
    expect(result.checks.alternateFixPasses).toBe(true);
    expect(result.checks.decoyFixStillFails).toBe(true);
    expect(result.checks.deterministicRuns).toBe(10);
    expect(result.checks.deterministicFailures).toBe(10);

    const reportContent = await readFile(
      path.join(root, 'runs', verifiedRunId, 'report.md'),
      'utf8',
    );
    expect(reportContent).toContain('# ReplayKit execution report');
    expect(reportContent).toContain('VERIFIED');
    expect(reportContent).toContain('7292def780e1444fbc903d992a2a8c56');
  });
});
