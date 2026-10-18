import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  SentryImportResultSchema,
  SupportedRevisionsSchema,
  type SentryImportResult,
  type SupportedRevision,
} from '../../sentry/src/schemas.js';
import { SentryImportError } from '../../sentry/src/errors.js';
import { importSentryIssue } from '../../sentry/src/index.js';
import { IncidentSchema, type Incident } from '../../contracts/src/index.js';
import { managedDirectory, readManagedFile, RunIdSchema } from '../../runtime/src/index.js';
import { atomicJson } from '../../runtime/src/storage.js';
import { loadManifest } from '../../judge/src/sandbox.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const StoredImportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  importId: RunIdSchema,
  result: SentryImportResultSchema,
});

export async function loadSupportedRevisions(root: string): Promise<SupportedRevision[]> {
  try {
    const dir = await managedDirectory(root, ['work', 'sentry']);
    return SupportedRevisionsSchema.parse(
      JSON.parse(await readManagedFile(dir, 'supported-revisions.json', 65_536)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new SentryImportError('INVALID_REVISION_MAPPING');
  }
}

/** Operator-only approval command. It is never exposed through MCP or incident text. */
export async function approveRevision(root: string, release: string): Promise<SupportedRevision> {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(release))
    throw new SentryImportError('INVALID_REVISION_MAPPING');
  const manifest = await loadManifest(root);
  if (
    !manifest.applicationSourceHash ||
    manifest.postgresRuntime?.mode !== 'initdb' ||
    manifest.postgresRuntime.fsync !== 'on'
  )
    throw new SentryImportError('INVALID_REVISION_MAPPING');
  const row: SupportedRevision = {
    release,
    service: 'checkout-api',
    revision: manifest.appImages.buggy,
    applicationSourceHash: manifest.applicationSourceHash,
  };
  const list = await loadSupportedRevisions(root);
  const prior = list.find((item) => item.release === release);
  if (prior && hash(prior) !== hash(row)) throw new Error('RELEASE_REBINDING_REJECTED');
  const dir = await managedDirectory(root, ['work', 'sentry'], true);
  await atomicJson(
    dir,
    'supported-revisions.json',
    SupportedRevisionsSchema.parse(prior ? list : [...list, row]),
  );
  return row;
}

export async function saveImportedIncident(root: string, raw: SentryImportResult) {
  const result = SentryImportResultSchema.parse(raw);
  if (hash(result.incident) !== result.provenance.normalizedIncidentHash)
    throw new Error('IMPORT_INTEGRITY_MISMATCH');
  const importId = randomUUID();
  const dir = await managedDirectory(root, ['runs', 'imports', importId], true);
  await writeFile(
    path.join(dir, 'incident.json'),
    JSON.stringify(result.incident, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  await atomicJson(dir, 'import.json', { schemaVersion: 1, importId, result });
  return {
    importId,
    artifact: `runs/imports/${importId}/incident.json`,
    summary: result.summary,
    provenance: result.provenance,
  };
}

async function readImport(root: string, importId: string) {
  if (!RunIdSchema.safeParse(importId).success) throw new Error('INVALID_IMPORT_ID');
  const dir = await managedDirectory(root, ['runs', 'imports', importId]);
  const stored = StoredImportSchema.parse(JSON.parse(await readManagedFile(dir, 'import.json')));
  let incident: Incident;
  try {
    incident = IncidentSchema.parse(JSON.parse(await readManagedFile(dir, 'incident.json')));
  } catch {
    throw new Error('IMPORT_INTEGRITY_MISMATCH');
  }
  if (
    stored.importId !== importId ||
    hash(incident) !== stored.result.provenance.normalizedIncidentHash ||
    hash(incident) !== hash(stored.result.incident)
  )
    throw new Error('IMPORT_INTEGRITY_MISMATCH');
  return stored.result;
}
export async function inspectImportedIncident(root: string, importId: string) {
  const result = await readImport(root, importId);
  return {
    importId,
    artifact: `runs/imports/${importId}/incident.json`,
    summary: result.summary,
    provenance: result.provenance,
  };
}
export async function importedIncident(root: string, importId: string): Promise<Incident> {
  return (await readImport(root, importId)).incident;
}
export async function importSentryManaged(
  root: string,
  url: string,
  env: Record<string, string | undefined> = process.env,
) {
  const result = await importSentryIssue(url, {
    token: env.SENTRY_AUTH_TOKEN,
    selfHostedBaseUrl: env.SENTRY_BASE_URL,
    supportedRevisions: await loadSupportedRevisions(root),
  });
  return saveImportedIncident(root, result);
}
