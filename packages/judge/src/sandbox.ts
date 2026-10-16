import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  ExecutionEvidenceSchema,
  IncidentSchema,
  PaymentRequestSchema,
  ReplayPlanSchema,
  type ExecutionEvidence,
  type PaymentRequest,
} from '../../contracts/src/index.js';
import { normalizeIncident, redact } from '../../telemetry/src/index.js';
import { docker } from './docker.js';
import { checkIsolation, validateBrokerRequest } from './sandbox-policy.js';
import { candidateStateError } from './binding.js';
import { cleanupOwnedResources } from './cleanup.js';
import { StageProfiler } from './profiling.js';
import { BrokerQueue } from './broker-queue.js';

export const variants = ['buggy', 'reference', 'alternate', 'decoy'] as const;
export type Variant = (typeof variants)[number];
const imageId = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const variantImages = z.object({
  buggy: imageId,
  reference: imageId,
  alternate: imageId,
  decoy: imageId,
});
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ManifestSchema = z.object({
  schemaVersion: z.literal(1),
  nodeImage: imageId,
  postgresImage: imageId,
  candidateImage: imageId,
  plannerImage: imageId,
  appImages: variantImages,
  sourceHashes: z.object({ buggy: hash, reference: hash, alternate: hash, decoy: hash }),
  postgresRuntime: z
    .object({
      mode: z.enum(['initdb', 'template-copy']),
      baseImage: imageId,
      templateSourceHash: hash.optional(),
      schemaHash: hash.optional(),
      fsync: z.enum(['on', 'off']),
    })
    .refine((runtime) => runtime.mode !== 'initdb' || runtime.fsync === 'on', {
      message: 'The stock PostgreSQL image requires fsync on; fsync off needs template-copy mode',
      path: ['fsync'],
    })
    .optional(),
  builtAt: z.string(),
});
export type SandboxManifest = z.infer<typeof ManifestSchema>;
export async function loadManifest(root: string) {
  return ManifestSchema.parse(
    JSON.parse(await readFile(path.join(root, 'work/sandbox/manifest.json'), 'utf8')),
  );
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const limits = [
  '--cap-drop=ALL',
  '--security-opt=no-new-privileges',
  '--pids-limit=64',
  '--memory=256m',
  '--cpus=1',
  '--log-driver=json-file',
  '--log-opt=max-size=1m',
  '--log-opt=max-file=1',
];
const JsonResponse = z.object({ status: z.number().int(), body: z.unknown() });

export async function planInSandbox(root: string, input: unknown) {
  const incident = IncidentSchema.parse(input);
  const manifest = await loadManifest(root);
  const runId = randomUUID();
  const name = `rk-planner-${runId}`;
  try {
    const result = await docker(
      [
        'run',
        '--rm',
        '-i',
        '--name',
        name,
        '--label',
        `replaykit.run=${runId}`,
        '--network',
        'none',
        '--user',
        '1000:1000',
        '--read-only',
        ...limits,
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=16m',
        manifest.plannerImage,
      ],
      { input: JSON.stringify(incident), timeoutMs: 15000 },
    );
    return ReplayPlanSchema.parse(JSON.parse(result.stdout));
  } finally {
    await cleanupOwnedResources(runId, [name], undefined);
  }
}

/** Candidate stdout is a bounded command channel, never trusted execution evidence. */
async function runCandidate(
  name: string,
  app: string,
  request: PaymentRequest,
  events: ExecutionEvidence['schedule'],
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string; requests: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['start', '-ai', name], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let buffer = '';
    let count = 0;
    let settled = false;
    let stopping = false;
    const queue = new BrokerQueue((error) => fail(error));
    const seen = new Set<number>();
    const fail = (error: Error) => {
      if (settled || stopping) return;
      stopping = true;
      clearTimeout(timer);
      child.kill();
      queue.abort(error);
      void queue.drain().catch(() => {
        if (settled) return;
        settled = true;
        reject(error);
      });
    };
    const timer = setTimeout(() => fail(new Error('CANDIDATE_TIMEOUT')), timeoutMs);
    child.on('error', fail);
    child.stdin.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EPIPE') fail(error);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 65536) fail(new Error('CANDIDATE_OUTPUT_LIMIT'));
    });
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled || stopping) return;
      stdout += chunk.toString();
      buffer += chunk.toString();
      if (stdout.length > 65536) {
        fail(new Error('CANDIDATE_OUTPUT_LIMIT'));
        return;
      }
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line.startsWith('@replaykit/request:')) continue;
        queue.enqueue(async () => {
          const message = validateBrokerRequest(
            JSON.parse(line.slice('@replaykit/request:'.length)),
            request,
          );
          if (seen.has(message.id) || seen.size >= 20)
            throw new Error('CANDIDATE_PROTOCOL_REJECTED');
          seen.add(message.id);
          const command =
            message.action === 'pay'
              ? { action: 'pay', input: message.input }
              : { action: 'charges', orderId: message.orderId };
          const raw = await docker(
            [
              'exec',
              app,
              'node',
              '/app/dist/apps/checkout-api/src/broker-client.js',
              JSON.stringify(command),
            ],
            { timeoutMs: 10000 },
          );
          const result = JsonResponse.parse(JSON.parse(raw.stdout));
          if (result.status >= 500) throw new Error('APPLICATION_INFRASTRUCTURE_ERROR');
          if (message.action === 'pay') count += 1;
          events.push({
            sequence: events.length + 1,
            kind: 'request',
            checkpoint: `${message.action}.${seen.size}`,
          });
          if (!child.stdin.destroyed)
            child.stdin.write(JSON.stringify({ id: message.id, ok: true, value: result }) + '\n');
        });
      }
    });
    child.on('close', (code) => {
      void queue
        .drain()
        .then(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ code: code ?? -1, stdout, stderr, requests: count });
        })
        .catch(fail);
    });
  });
}

export async function runSandbox(
  root: string,
  output: string,
  variant: Variant,
  testSource: string,
  rawRequest: PaymentRequest,
  options: { candidateTimeoutMs?: number; manifest?: SandboxManifest } = {},
): Promise<ExecutionEvidence> {
  const started = performance.now();
  const profiler = new StageProfiler();
  profiler.begin('preparation');
  const runId = randomUUID();
  const prefix = `rk-${runId}`;
  const network = `${prefix}-net`;
  const db = `${prefix}-db`;
  const app = `${prefix}-app`;
  const candidate = `${prefix}-test`;
  const databasePassword = randomBytes(32).toString('hex');
  // Track intended names before Docker calls: creation may succeed before startup/client failure.
  const ownedContainers = [candidate, app, db];
  const executionDir = path.join(output, 'executions', runId);
  const candidateDir = path.join(executionDir, 'candidate');
  await mkdir(candidateDir, { recursive: true });
  await writeFile(path.join(candidateDir, 'repro.test.ts'), testSource);
  const evidence: ExecutionEvidence = {
    runId,
    variantHash: '0'.repeat(64),
    candidateHash: sha256(testSource),
    executionStatus: 'ERROR',
    exitCode: null,
    failure: null,
    charges: null,
    requests: 0,
    cleanDatabase: false,
    isolated: false,
    offline: false,
    schedule: [],
    durationMs: 0,
    stdout: '',
    stderr: '',
  };
  try {
    const request = PaymentRequestSchema.parse(rawRequest);
    const candidateTimeoutMs = z
      .number()
      .int()
      .min(100)
      .max(30000)
      .parse(options.candidateTimeoutMs ?? 30000);
    const manifest = options.manifest
      ? ManifestSchema.parse(options.manifest)
      : await loadManifest(root);
    evidence.variantHash = manifest.sourceHashes[variant];
    profiler.begin('networkCreation');
    await docker(['network', 'create', '--internal', '--label', `replaykit.run=${runId}`, network]);
    const netConfig = JSON.parse((await docker(['network', 'inspect', network])).stdout) as {
      Internal: boolean;
    }[];
    profiler.begin('postgresStartup');
    await docker([
      'run',
      '-d',
      '--name',
      db,
      '--label',
      `replaykit.run=${runId}`,
      '--network',
      network,
      '--network-alias',
      'db',
      '--user',
      '70:70',
      '--read-only',
      ...limits,
      '--tmpfs',
      '/var/lib/postgresql/data:rw,noexec,nosuid,size=128m,uid=70,gid=70',
      '--tmpfs',
      '/var/run/postgresql:rw,noexec,nosuid,size=4m,uid=70,gid=70',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=4m',
      '-e',
      'POSTGRES_USER=replaykit',
      '-e',
      `POSTGRES_PASSWORD=${databasePassword}`,
      '-e',
      'POSTGRES_DB=replaykit',
      '-e',
      `REPLAYKIT_PG_FSYNC=${manifest.postgresRuntime?.fsync ?? 'on'}`,
      manifest.postgresImage,
    ]);
    profiler.begin('postgresReadiness');
    await docker(
      [
        'exec',
        db,
        'sh',
        '-c',
        'for i in $(seq 1 60); do pg_isready -U replaykit -d replaykit >/dev/null 2>&1 && exit 0; sleep 0.2; done; exit 1',
      ],
      { timeoutMs: 20000 },
    );
    profiler.begin('applicationStartup');
    await docker([
      'run',
      '-d',
      '--name',
      app,
      '--label',
      `replaykit.run=${runId}`,
      '--network',
      network,
      '--user',
      '1000:1000',
      '--read-only',
      ...limits,
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=16m',
      '-e',
      `DATABASE_URL=postgres://replaykit:${databasePassword}@db:5432/replaykit`,
      '-e',
      `REPLAYKIT_RELEASE=${manifest.appImages[variant]}`,
      manifest.appImages[variant],
    ]);
    // Readiness polling is infrastructure startup, never test scheduling/correctness.
    profiler.begin('applicationReadiness');
    await docker(
      [
        'exec',
        app,
        'node',
        '-e',
        "const end=Date.now()+15000; async function ready(){try{const r=await fetch('http://127.0.0.1:4318/health');if(r.ok)return;}catch{}if(Date.now()>end)process.exit(1);setTimeout(ready,100);}ready();",
      ],
      { timeoutMs: 18000 },
    );
    profiler.begin('candidatePreparation');
    const query = async (sql: string) =>
      (
        await docker(['exec', db, 'psql', '-U', 'replaykit', '-d', 'replaykit', '-tA', '-c', sql])
      ).stdout.trim();
    evidence.cleanDatabase =
      (await query(
        'SELECT (SELECT count(*) FROM charges) + (SELECT count(*) FROM payment_attempts);',
      )) === '0';
    await docker([
      'create',
      '-i',
      '--name',
      candidate,
      '--label',
      `replaykit.run=${runId}`,
      '--network',
      'none',
      '--user',
      '1000:1000',
      '--read-only',
      ...limits,
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=16m',
      '--mount',
      `type=bind,source=${candidateDir},target=/candidate,readonly`,
      manifest.candidateImage,
      'node',
      '--experimental-strip-types',
      '/candidate/repro.test.ts',
    ]);
    const inspect = JSON.parse((await docker(['inspect', candidate])).stdout) as unknown[];
    evidence.isolated = checkIsolation(inspect[0]);
    evidence.offline = evidence.isolated && netConfig[0]?.Internal === true;
    await writeFile(
      path.join(executionDir, 'isolation.json'),
      JSON.stringify({ candidate: inspect[0], network: netConfig[0] }, null, 2),
    );
    if (!evidence.isolated || !evidence.offline || !evidence.cleanDatabase)
      throw new Error('SANDBOX_PRECONDITION_FAILED');
    profiler.begin('candidateExecution');
    const result = await runCandidate(
      candidate,
      app,
      request,
      evidence.schedule,
      candidateTimeoutMs,
    );
    profiler.begin('evidenceCollection');
    const exited = JSON.parse((await docker(['inspect', candidate])).stdout) as {
      State: unknown;
    }[];
    await writeFile(
      path.join(executionDir, 'candidate-state.json'),
      JSON.stringify(exited[0]?.State, null, 2),
    );
    const stateError = candidateStateError(exited[0]?.State);
    if (stateError) throw new Error(stateError);
    const actualCode = z.object({ ExitCode: z.number().int() }).parse(exited[0]?.State).ExitCode;
    if (actualCode !== result.code) throw new Error('CANDIDATE_ATTACH_STATUS_MISMATCH');
    evidence.exitCode = result.code;
    evidence.stdout = String(redact(result.stdout));
    evidence.stderr = String(redact(result.stderr));
    evidence.requests = result.requests;
    evidence.charges = Number(await query('SELECT count(*) FROM charges;'));
    const rows = await query(
      "SELECT COALESCE(json_agg(t), '[]'::json) FROM (SELECT order_id,client_key,provider_key,amount FROM charges ORDER BY id) t;",
    );
    await writeFile(path.join(executionDir, 'database.json'), rows);
    const logs = await docker(['logs', app]);
    await writeFile(
      path.join(executionDir, 'application.log'),
      String(redact(logs.stdout + logs.stderr)),
    );
    for (const line of logs.stdout.split(/\r?\n/)) {
      if (!line.startsWith('{')) continue;
      const record: unknown = JSON.parse(line);
      const parsed = z
        .object({ kind: z.literal('incident'), event: z.unknown() })
        .safeParse(record);
      if (parsed.success) {
        const observed = normalizeIncident(parsed.data.event, 'full');
        evidence.failure = {
          type: observed.exception.type,
          topApplicationFrame: observed.exception.topApplicationFrame,
        };
        evidence.incident = parsed.data.event;
      }
    }
    evidence.executionStatus = 'COMPLETED';
  } catch (error) {
    profiler.fail();
    profiler.begin('errorEvidence');
    evidence.error = error instanceof Error ? error.message : String(error);
    // Error diagnostics remain trusted DB observations, never a successful judge gate.
    const count = await docker(
      [
        'exec',
        db,
        'psql',
        '-U',
        'replaykit',
        '-d',
        'replaykit',
        '-tA',
        '-c',
        'SELECT count(*) FROM charges;',
      ],
      { allowFailure: true },
    ).catch(() => null);
    if (count?.code === 0 && /^\d+$/.test(count.stdout.trim())) {
      evidence.charges = Number(count.stdout.trim());
      await writeFile(
        path.join(executionDir, 'error-database.json'),
        JSON.stringify({ charges: evidence.charges }),
      );
    }
    for (const name of ownedContainers.filter((name) => name === app || name === db)) {
      const logs = await docker(['logs', name], { allowFailure: true }).catch(() => null);
      if (logs)
        await writeFile(
          path.join(executionDir, name === app ? 'application-error.log' : 'postgres-error.log'),
          String(redact(logs.stdout + logs.stderr)),
        );
    }
  } finally {
    profiler.begin('cleanup');
    try {
      await cleanupOwnedResources(runId, ownedContainers, network);
    } catch (error) {
      profiler.fail();
      evidence.executionStatus = 'ERROR';
      evidence.error = [evidence.error, error instanceof Error ? error.message : String(error)]
        .filter(Boolean)
        .join('; ');
    }
  }
  profiler.begin('artifactWrite');
  evidence.durationMs = Math.round(performance.now() - started);
  const validated = ExecutionEvidenceSchema.parse(evidence);
  await writeFile(path.join(executionDir, 'evidence.json'), JSON.stringify(validated, null, 2));
  await writeFile(
    path.join(executionDir, 'profile.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        variant,
        ...profiler.finish(),
      },
      null,
      2,
    ),
  );
  return validated;
}
