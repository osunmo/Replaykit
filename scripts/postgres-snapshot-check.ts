import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cleanupOwnedResources } from '../packages/judge/src/cleanup.js';
import { docker } from '../packages/judge/src/docker.js';
import { loadManifest } from '../packages/judge/src/sandbox.js';

// Only the trusted supervisor executes this probe. No credential or inspection is published.
const root = process.cwd();
const manifest = await loadManifest(root);
const runId = randomUUID();
const output = path.join(root, 'runs', runId);
await mkdir(output, { recursive: true });
const names = [
  'first',
  'second',
  'invalid-password',
  'invalid-fsync',
  'nonempty-data',
  'unverified-template',
  'missing-password',
].map((suffix) => `rk-${runId}-pg-${suffix}`);
const passwords = Array.from({ length: 3 }, () => randomBytes(32).toString('hex'));
const checks: Record<string, boolean> = {};
let failure: string | undefined;

function options(name: string): string[] {
  return [
    '--name',
    name,
    '--label',
    `replaykit.run=${runId}`,
    '--network=none',
    '--user=70:70',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--pids-limit=64',
    '--memory=256m',
    '--cpus=1',
    '--log-driver=json-file',
    '--log-opt=max-size=1m',
    '--log-opt=max-file=1',
    '--tmpfs=/var/lib/postgresql/data:rw,noexec,nosuid,size=128m,uid=70,gid=70',
    '--tmpfs=/var/run/postgresql:rw,noexec,nosuid,size=4m,uid=70,gid=70',
    '--tmpfs=/tmp:rw,noexec,nosuid,size=4m',
  ];
}

async function query(name: string, sql: string, password?: string) {
  return docker(
    [
      'exec',
      ...(password === undefined ? [] : ['-e', `PGPASSWORD=${password}`]),
      name,
      'psql',
      '-X',
      '--no-password',
      '-v',
      'ON_ERROR_STOP=1',
      ...(password === undefined ? [] : ['-h', '127.0.0.1']),
      '-U',
      'replaykit',
      '-d',
      'replaykit',
      '-tA',
      '-c',
      sql,
    ],
    { allowFailure: true, timeoutMs: 10000 },
  );
}

async function fingerprint(name: string) {
  const result = await docker([
    'exec',
    name,
    'sh',
    '-c',
    'set -eu; set -o pipefail; test -f /opt/replaykit-template/.replaykit-template-verified; find /opt/replaykit-template -type f -exec sha256sum {} + | sort | sha256sum',
  ]);
  const digest = result.stdout.trim().split(/\s+/)[0];
  assert.match(digest ?? '', /^[a-f0-9]{64}$/);
  return digest;
}

async function startAndWait(name: string, password: string, extraEnvironment: string[] = []) {
  await docker([
    'run',
    '-d',
    ...options(name),
    ...[`POSTGRES_PASSWORD=${password}`, ...extraEnvironment].flatMap((value) => ['-e', value]),
    manifest.postgresImage,
  ]);
  await docker(
    [
      'exec',
      name,
      'sh',
      '-c',
      'for i in $(seq 1 100); do pg_isready -U replaykit -d replaykit >/dev/null 2>&1 && exit 0; sleep 0.2; done; exit 1',
    ],
    { timeoutMs: 25000 },
  );
}

async function assertSecretFreeLogs(name: string) {
  const logs = await docker(['logs', name]);
  for (const password of passwords)
    assert.equal((logs.stdout + logs.stderr).includes(password), false);
}

try {
  assert.equal(
    manifest.postgresRuntime?.mode,
    'template-copy',
    'PostgreSQL snapshot probe requires a template-copy sandbox manifest',
  );
  for (let index = 0; index < 2; index++) {
    const name = names[index]!;
    await startAndWait(name, passwords[index]!);
    const inspection = JSON.parse((await docker(['inspect', name])).stdout)[0] as {
      Config: { User: string };
      HostConfig: { ReadonlyRootfs: boolean; NetworkMode: string; Tmpfs: Record<string, string> };
      Mounts: { Type: string; Destination: string }[];
    };
    assert.equal(inspection.Config.User, '70:70');
    assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
    assert.equal(inspection.HostConfig.NetworkMode, 'none');
    assert.deepEqual(Object.keys(inspection.HostConfig.Tmpfs).sort(), [
      '/tmp',
      '/var/lib/postgresql/data',
      '/var/run/postgresql',
    ]);
    assert.ok(inspection.Mounts.every((mount) => mount.Type === 'tmpfs'));
    const empty = await query(
      name,
      'SELECT (SELECT count(*) FROM charges) + (SELECT count(*) FROM payment_attempts);',
      passwords[index],
    );
    assert.equal(empty.code, 0);
    assert.equal(empty.stdout.trim(), '0');
    const fsync = await query(name, 'SHOW fsync;');
    assert.equal(fsync.code, 0);
    assert.equal(fsync.stdout.trim(), 'on');
    const denied = await query(name, 'SELECT 1;', passwords[1 - index]);
    assert.notEqual(denied.code, 0);
    assert.match(denied.stderr, /password authentication failed/);
    const noPassword = await docker(
      [
        'exec',
        name,
        'sh',
        '-c',
        'unset PGPASSWORD POSTGRES_PASSWORD; exec psql -X --no-password -h 127.0.0.1 -U replaykit -d replaykit -tAc "SELECT 1"',
      ],
      { allowFailure: true },
    );
    assert.notEqual(noPassword.code, 0);
    assert.match(noPassword.stderr, /no password supplied/);
    checks[`database${index + 1}FreshAndAuthenticated`] = true;
  }
  checks.privateTmpfsAndReadonlyRoot = true;
  checks.fsyncEnabledByDefault = true;
  // The seed's marker is written only after build-time SQL proves empty tables and a NULL password.
  checks.buildVerifiedEmptySeedWithoutCredential = true;
  const before = await Promise.all(names.slice(0, 2).map(fingerprint));
  assert.equal(before[0], before[1]);
  const inserted = await query(
    names[0]!,
    "INSERT INTO charges (id,order_id,client_key,provider_key,amount) VALUES ('snapshot-probe','snapshot-order','snapshot-key','snapshot-provider',100);",
    passwords[0],
  );
  assert.equal(inserted.code, 0);
  for (let index = 0; index < 2; index++) {
    const rows = await query(names[index]!, 'SELECT count(*) FROM charges;');
    assert.equal(rows.code, 0);
    assert.equal(rows.stdout.trim(), index === 0 ? '1' : '0');
  }
  checks.independentMutableState = true;
  assert.deepEqual(await Promise.all(names.slice(0, 2).map(fingerprint)), before);
  checks.immutableTemplateUnchanged = true;

  await assertSecretFreeLogs(names[0]!);
  await cleanupOwnedResources(runId, [names[0]!], undefined);
  await startAndWait(names[0]!, passwords[2]!, ['REPLAYKIT_PG_FSYNC=off']);
  const fresh = await query(
    names[0]!,
    'SELECT (SELECT count(*) FROM charges) + (SELECT count(*) FROM payment_attempts);',
    passwords[2],
  );
  assert.equal(fresh.code, 0);
  assert.equal(fresh.stdout.trim(), '0');
  const explicitOff = await query(names[0]!, 'SHOW fsync;');
  assert.equal(explicitOff.code, 0);
  assert.equal(explicitOff.stdout.trim(), 'off');
  const oldCredential = await query(names[0]!, 'SELECT 1;', passwords[0]);
  assert.notEqual(oldCredential.code, 0);
  assert.match(oldCredential.stderr, /password authentication failed/);
  assert.equal(await fingerprint(names[0]!), before[0]);
  checks.replacementCloneStartsFresh = true;
  checks.explicitFsyncOffSupported = true;
  checks.previousCredentialRejected = true;

  for (const [index, environment, expected] of [
    [2, ['POSTGRES_PASSWORD=invalid'], 'POSTGRES_BOOTSTRAP_INVALID_PASSWORD'],
    [
      3,
      [`POSTGRES_PASSWORD=${passwords[0]!}`, 'REPLAYKIT_PG_FSYNC=invalid'],
      'POSTGRES_BOOTSTRAP_INVALID_FSYNC',
    ],
    [6, [], 'POSTGRES_BOOTSTRAP_INVALID_PASSWORD'],
  ] as const) {
    const rejected = await docker(
      [
        'run',
        ...options(names[index]!),
        ...environment.flatMap((value) => ['-e', value]),
        manifest.postgresImage,
      ],
      { allowFailure: true, timeoutMs: 10000 },
    );
    assert.notEqual(rejected.code, 0);
    assert.match(rejected.stderr, new RegExp(expected));
  }
  checks.invalidBootstrapInputsRejected = true;

  const nonempty = await docker(
    [
      'run',
      ...options(names[4]!),
      '-e',
      `POSTGRES_PASSWORD=${passwords[0]!}`,
      '--entrypoint=sh',
      manifest.postgresImage,
      '-c',
      'printf "%s\\n" sentinel > "$PGDATA/replaykit-sentinel"; exec /usr/local/bin/replaykit-postgres-entrypoint.sh',
    ],
    { allowFailure: true, timeoutMs: 10000 },
  );
  assert.notEqual(nonempty.code, 0);
  assert.match(nonempty.stderr, /POSTGRES_BOOTSTRAP_PGDATA_NOT_EMPTY/);
  checks.prepopulatedDataRejected = true;
  const unverified = await docker(
    [
      'run',
      ...options(names[5]!),
      '-e',
      `POSTGRES_PASSWORD=${passwords[0]!}`,
      '--tmpfs=/opt/replaykit-template:ro,noexec,nosuid,size=1m,uid=70,gid=70',
      manifest.postgresImage,
    ],
    { allowFailure: true, timeoutMs: 10000 },
  );
  assert.notEqual(unverified.code, 0);
  assert.match(unverified.stderr, /POSTGRES_BOOTSTRAP_TEMPLATE_UNVERIFIED/);
  checks.unverifiedTemplateRejected = true;
  await Promise.all(names.map(assertSecretFreeLogs));
  checks.credentialsAbsentFromLogs = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  for (const password of passwords) failure = failure.replaceAll(password, '[REDACTED]');
} finally {
  try {
    await cleanupOwnedResources(runId, names, undefined);
    checks.cleanup = true;
  } catch {
    checks.cleanup = false;
    failure = [failure, 'POSTGRES_SNAPSHOT_PROBE_CLEANUP_FAILED'].filter(Boolean).join('; ');
  }
}
const summary = {
  schemaVersion: 1,
  status: failure ? 'FAIL' : 'PASS',
  postgresImage: manifest.postgresImage,
  checks,
  ...(failure ? { error: failure } : {}),
};
await writeFile(
  path.join(output, 'postgres-snapshot.json'),
  JSON.stringify(summary, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({ ...summary, output: `runs/${runId}/postgres-snapshot.json` }, null, 2) + '\n',
);
if (failure) process.exitCode = 1;
