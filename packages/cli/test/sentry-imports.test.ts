import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeSentryEvent } from '../../sentry/src/normalize.js';
import {
  loadSupportedRevisions,
  saveImportedIncident,
  inspectImportedIncident,
  importedIncident,
} from '../src/sentry-imports.js';
const roots: string[] = [];
async function root() {
  const p = await mkdtemp(path.join(tmpdir(), 'replaykit-import-'));
  roots.push(p);
  return p;
}
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});
function normalized() {
  return normalizeSentryEvent(
    {
      eventID: 'a'.repeat(32),
      groupID: '123',
      dateCreated: '2026-10-17T00:00:00.000Z',
      release: 'opaque-123',
      projectID: '42',
      projectSlug: 'synthetic',
      entries: [
        {
          type: 'exception',
          data: {
            values: [
              {
                type: 'DuplicatePaymentError',
                value: 'canary-value',
                stacktrace: {
                  frames: [
                    {
                      function: 'createPayment',
                      filename: '/app/dist/apps/checkout-api/src/payments.js',
                      inApp: true,
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
    { origin: 'https://demo.sentry.io', organization: 'demo', issueId: '123' },
    [
      {
        release: 'opaque-123',
        service: 'checkout-api',
        revision: `sha256:${'b'.repeat(64)}`,
        applicationSourceHash: 'c'.repeat(64),
      },
    ],
    { token: 'canary-value' },
  );
}
describe('managed Sentry imports', () => {
  it('requires explicit revision approvals; missing config supplies no implicit current revision', async () => {
    expect(await loadSupportedRevisions(await root())).toEqual([]);
  });
  it('persists only validated normalized incident and safe provenance, returning a relative reference', async () => {
    const p = await root();
    const saved = await saveImportedIncident(p, normalized());
    expect(saved.artifact).toBe(`runs/imports/${saved.importId}/incident.json`);
    expect(JSON.stringify(await inspectImportedIncident(p, saved.importId))).not.toContain(
      'canary-value',
    );
    expect(await importedIncident(p, saved.importId)).toEqual(normalized().incident);
    const bytes = await readFile(
      path.join(p, 'runs/imports', saved.importId, 'import.json'),
      'utf8',
    );
    expect(bytes).not.toMatch(/canary-value|Authorization|rawResponse/);
  });
  it('rejects traversal and altered normalized incident bytes', async () => {
    const p = await root();
    await expect(inspectImportedIncident(p, '../private')).rejects.toThrow('INVALID_IMPORT_ID');
    const saved = await saveImportedIncident(p, normalized());
    await writeFile(path.join(p, 'runs/imports', saved.importId, 'incident.json'), '{}');
    await expect(importedIncident(p, saved.importId)).rejects.toThrow('IMPORT_INTEGRITY_MISMATCH');
  });
  it('rejects invalid local mapping JSON without echoing its contents', async () => {
    const p = await root();
    await mkdir(path.join(p, 'work/sentry'), { recursive: true });
    await writeFile(path.join(p, 'work/sentry/supported-revisions.json'), '{canary-value');
    await expect(loadSupportedRevisions(p)).rejects.toThrow('INVALID_REVISION_MAPPING');
  });
});
