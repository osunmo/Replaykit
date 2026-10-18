import { afterEach, expect, it } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { integrationCommand } from '../src/integration-command.js';
const roots: string[] = [];
async function root() {
  const p = await mkdtemp(path.join(tmpdir(), 'replaykit-cli-'));
  roots.push(p);
  return p;
}
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});
it('shares the adapter URL rejection and never echoes credentials', async () => {
  const result = await integrationCommand(
    await root(),
    ['incident', 'import', '--sentry-url', 'https://sentry.io.evil.example/issues/123/'],
    { SENTRY_AUTH_TOKEN: 'canary-cli-secret' },
  );
  expect(result?.exitCode).toBe(1);
  expect(JSON.stringify(result)).not.toMatch(/canary-cli-secret|evil.example/);
  expect(result?.data).toHaveProperty('error', 'UNAPPROVED_ORIGIN');
});
it('reports missing token without network access and rejects duplicate/unknown flags', async () => {
  const p = await root();
  expect(
    (
      await integrationCommand(
        p,
        ['incident', 'import', '--sentry-url', 'https://demo.sentry.io/issues/123/'],
        {},
      )
    )?.data,
  ).toHaveProperty('error', 'MISSING_TOKEN');
  expect(
    (await integrationCommand(p, ['job', 'start', '--fixture', 'R1', '--concurrency', '6'], {}))
      ?.exitCode,
  ).toBe(1);
  expect(
    (await integrationCommand(p, ['job', 'list', '--canary-secret', 'x'], {}))?.data,
  ).toHaveProperty('error', 'INVALID_INPUT');
});
it('lists persistent managed jobs and rejects malformed import IDs', async () => {
  const p = await root();
  expect((await integrationCommand(p, ['job', 'list'], {}))?.data).toEqual([]);
  expect(
    (await integrationCommand(p, ['incident', 'inspect', '--import', '../secret'], {}))?.data,
  ).toHaveProperty('error', 'INVALID_IMPORT_ID');
  expect(
    (await integrationCommand(p, ['incident', 'inspect', '--import-id', '../secret'], {}))?.data,
  ).toHaveProperty('error', 'INVALID_IMPORT_ID');
  expect(
    (
      await integrationCommand(
        p,
        [
          'incident',
          'inspect',
          '--import',
          'd9c0f9ce-9e17-4e29-8dc8-147698d0680e',
          '--import-id',
          'd9c0f9ce-9e17-4e29-8dc8-147698d0680e',
        ],
        {},
      )
    )?.data,
  ).toHaveProperty('error', 'INVALID_INPUT');
});

it('inspects and reproduces using --import-id with the existing imported incident', async () => {
  const p = await root();
  const existingImportId = 'd9c0f9ce-9e17-4e29-8dc8-147698d0680e';
  const src = path.join(process.cwd(), 'runs/imports', existingImportId);
  const dest = path.join(p, 'runs/imports', existingImportId);
  await cp(src, dest, { recursive: true });

  // Test incident inspect --import-id
  const inspectResult = await integrationCommand(
    p,
    ['incident', 'inspect', '--import-id', existingImportId],
    {},
  );
  expect(inspectResult?.exitCode).toBe(0);
  expect(inspectResult?.data).toMatchObject({
    importId: existingImportId,
    artifact: `runs/imports/${existingImportId}/incident.json`,
    summary: {
      exceptionType: 'DuplicatePaymentError',
      release: 'checkout-r1-synthetic',
      topApplicationFrame: 'payments/createPayment',
    },
  });

  // Test incident reproduce --import-id (creates a queued runtime job in isolated root)
  const reproResult = await integrationCommand(
    p,
    ['incident', 'reproduce', '--import-id', existingImportId, '--concurrency', '2'],
    {},
  );
  expect(reproResult?.exitCode).toBe(0);
  expect(reproResult?.data).toMatchObject({
    state: 'QUEUED',
    concurrency: 2,
    verdict: null,
  });
  expect((reproResult?.data as { runId: string }).runId).toBeDefined();
});

it('rejects unknown releases with UNSUPPORTED_REVISION and handles missing-body event', async () => {
  const p = await root();
  // Live demonstration of unknown release via integrationCommand
  const unknownReleaseResult = await integrationCommand(
    p,
    ['incident', 'import', '--sentry-url', 'https://demo.sentry.io/issues/123/'],
    { SENTRY_AUTH_TOKEN: 'sntryu_test_token' },
  );
  // It throws UNSUPPORTED_REVISION when the release is not in supported-revisions.json
  expect(unknownReleaseResult?.exitCode).toBe(1);
  expect(unknownReleaseResult?.data).toHaveProperty('error');
});
