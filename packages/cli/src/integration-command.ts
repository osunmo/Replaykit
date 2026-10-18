import { createRuntime, RuntimeError, RunIdSchema } from '../../runtime/src/index.js';
import { SentryImportError } from '../../sentry/src/errors.js';
import {
  approveRevision,
  importedIncident,
  importSentryManaged,
  inspectImportedIncident,
} from './sentry-imports.js';
import { triggerSyntheticSentryDemo } from './sentry-demo.js';

interface CommandResult {
  data: unknown;
  exitCode: number;
}

function parseFlags(args: readonly string[]): {
  command: string;
  flags: Map<string, string>;
  error?: string;
} {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      if (flags.has(arg)) return { command: '', flags, error: 'DUPLICATE_FLAG' };
      const val = args[i + 1];
      if (val === undefined || val.startsWith('--')) {
        return { command: '', flags, error: 'MISSING_FLAG_VALUE' };
      }
      flags.set(arg, val);
      i += 2;
    } else {
      positional.push(arg);
      i += 1;
    }
  }
  return { command: positional.join(' '), flags };
}

function extractImportId(flags: Map<string, string>): { importId?: string; error?: string } {
  const hasImport = flags.has('--import');
  const hasImportId = flags.has('--import-id');
  if (hasImport && hasImportId) {
    return { error: 'INVALID_INPUT' };
  }
  const importId = flags.get('--import-id') ?? flags.get('--import');
  return { importId };
}

export async function integrationCommand(
  root: string,
  args: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<CommandResult | null> {
  const parsed = parseFlags(args);
  if (parsed.error) return { exitCode: 1, data: { error: 'INVALID_INPUT' } };
  const { command, flags } = parsed;

  const allowedFlagsByCommand: Record<string, string[]> = {
    'incident import': ['--sentry-url'],
    'incident inspect': ['--import', '--import-id'],
    'incident reproduce': ['--import', '--import-id', '--concurrency'],
    'incident approve-revision': ['--release'],
    'incident sentry-demo': ['--dsn', '--release', '--org', '--project', '--omit-body', '--poison'],
    'job start': ['--fixture', '--import', '--import-id', '--concurrency'],
    'job list': [],
    'job status': ['--run'],
    'job cancel': ['--run'],
    'job report': ['--run'],
    'job open-test': ['--run'],
  };

  const allowed = allowedFlagsByCommand[command];
  if (!allowed) return null;

  for (const flag of flags.keys()) {
    if (!allowed.includes(flag)) {
      return { exitCode: 1, data: { error: 'INVALID_INPUT' } };
    }
  }

  const runtime = createRuntime(root);

  try {
    if (command === 'incident import') {
      const url = flags.get('--sentry-url');
      if (!url) return { exitCode: 1, data: { error: 'INVALID_INPUT' } };
      const result = await importSentryManaged(root, url, env);
      return { exitCode: 0, data: result };
    }

    if (command === 'incident inspect') {
      const { importId, error: flagError } = extractImportId(flags);
      if (flagError) return { exitCode: 1, data: { error: flagError } };
      if (!importId || !RunIdSchema.safeParse(importId).success) {
        return { exitCode: 1, data: { error: 'INVALID_IMPORT_ID' } };
      }
      const result = await inspectImportedIncident(root, importId);
      return { exitCode: 0, data: result };
    }

    if (command === 'incident reproduce') {
      const { importId, error: flagError } = extractImportId(flags);
      if (flagError) return { exitCode: 1, data: { error: flagError } };
      if (!importId || !RunIdSchema.safeParse(importId).success) {
        return { exitCode: 1, data: { error: 'INVALID_IMPORT_ID' } };
      }
      const concStr = flags.get('--concurrency');
      const concurrency = concStr !== undefined ? Number(concStr) : 3;
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
        return { exitCode: 1, data: { error: 'INVALID_INPUT' } };
      }
      const incident = await importedIncident(root, importId);
      const job = await runtime.start({ incident, concurrency });
      return { exitCode: 0, data: job };
    }

    if (command === 'incident approve-revision') {
      const release = flags.get('--release');
      if (!release) return { exitCode: 1, data: { error: 'INVALID_INPUT' } };
      const result = await approveRevision(root, release);
      return { exitCode: 0, data: result };
    }

    if (command === 'incident sentry-demo') {
      const dsn = flags.get('--dsn') ?? env.SENTRY_DSN;
      const release = flags.get('--release') ?? env.SENTRY_RELEASE;
      const org = flags.get('--org') ?? env.SENTRY_ORG;
      const project = flags.get('--project') ?? env.SENTRY_PROJECT;
      const omitBody = flags.get('--omit-body');
      const poison = flags.get('--poison');
      const demoEnv = {
        ...env,
        ...(dsn ? { SENTRY_DSN: dsn } : {}),
        ...(release ? { SENTRY_RELEASE: release } : {}),
        ...(org ? { SENTRY_ORG: org } : {}),
        ...(project ? { SENTRY_PROJECT: project } : {}),
        ...(omitBody ? { SENTRY_OMIT_BODY: omitBody } : {}),
        ...(poison ? { SENTRY_POISON_PAYLOAD: poison } : {}),
      };
      const result = await triggerSyntheticSentryDemo(root, demoEnv);
      return { exitCode: 0, data: result };
    }

    if (command === 'job start') {
      const fixture = flags.get('--fixture');
      const { importId, error: flagError } = extractImportId(flags);
      if (flagError) return { exitCode: 1, data: { error: flagError } };
      const concStr = flags.get('--concurrency');
      const concurrency = concStr !== undefined ? Number(concStr) : 3;
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) {
        return { exitCode: 1, data: { error: 'INVALID_INPUT' } };
      }
      if (fixture === 'R1' && !importId) {
        const job = await runtime.start({ fixture: 'R1', concurrency });
        return { exitCode: 0, data: job };
      }
      if (importId && !fixture && RunIdSchema.safeParse(importId).success) {
        const incident = await importedIncident(root, importId);
        const job = await runtime.start({ incident, concurrency });
        return { exitCode: 0, data: job };
      }
      return { exitCode: 1, data: { error: 'INVALID_INPUT' } };
    }

    if (command === 'job list') {
      const jobs = await runtime.list();
      return { exitCode: 0, data: jobs };
    }

    if (command === 'job status') {
      const runId = flags.get('--run');
      if (!runId || !RunIdSchema.safeParse(runId).success) {
        return { exitCode: 1, data: { error: 'INVALID_RUN_ID' } };
      }
      const job = await runtime.status(runId);
      return { exitCode: 0, data: job };
    }

    if (command === 'job cancel') {
      const runId = flags.get('--run');
      if (!runId || !RunIdSchema.safeParse(runId).success) {
        return { exitCode: 1, data: { error: 'INVALID_RUN_ID' } };
      }
      const job = await runtime.cancel(runId);
      return { exitCode: 0, data: job };
    }

    if (command === 'job report') {
      const runId = flags.get('--run');
      if (!runId || !RunIdSchema.safeParse(runId).success) {
        return { exitCode: 1, data: { error: 'INVALID_RUN_ID' } };
      }
      const rep = await runtime.report(runId);
      return { exitCode: 0, data: rep };
    }

    if (command === 'job open-test') {
      const runId = flags.get('--run');
      if (!runId || !RunIdSchema.safeParse(runId).success) {
        return { exitCode: 1, data: { error: 'INVALID_RUN_ID' } };
      }
      const test = await runtime.openTest(runId);
      return { exitCode: 0, data: test };
    }
  } catch (error) {
    if (error instanceof SentryImportError) {
      return { exitCode: 1, data: { error: error.code } };
    }
    if (error instanceof RuntimeError) {
      return { exitCode: 1, data: { error: error.code } };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, data: { error: message } };
  }

  return null;
}
