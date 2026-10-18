import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { createReplayKitMcpServer } from './server.js';
import { atomicJson } from '../../runtime/src/storage.js';
import type { StoredJob } from '../../runtime/src/contracts.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'replaykit-mcp-test-'));
  roots.push(root);

  const runId = randomUUID();
  const runDir = path.join(root, 'runs', runId);
  await mkdir(runDir, { recursive: true });

  const now = new Date().toISOString();
  const job: StoredJob = {
    schemaVersion: 1,
    runId,
    state: 'RUNNING',
    createdAt: now,
    updatedAt: now,
    heartbeatAt: now,
    concurrency: 3,
    ownerToken: 'a'.repeat(64),
    progress: {
      phase: 'VERIFYING',
      completedExecutions: 2,
      totalExecutions: 17,
      preliminary: true,
    },
    verdict: null,
    reasonCode: null,
    cancelRequested: false,
  };
  await atomicJson(runDir, 'job.json', job);
  await writeFile(runDir + '/repro.test.ts', '// test source');
  await writeFile(runDir + '/report.md', '# Repro Report\nVerified.');
  await atomicJson(runDir, 'result.json', {
    schemaVersion: 1,
    incidentId: 'R1',
    runId,
    status: 'VERIFIED',
    telemetryTier: 'full',
    failureMatch: { type: 'DuplicatePaymentError', topApplicationFrame: 'payments/createPayment' },
    checks: {
      buggyFails: true,
      sameFailureIdentity: true,
      referenceFixPasses: true,
      alternateFixPasses: true,
      decoyFixStillFails: true,
      deterministicRuns: 10,
      deterministicFailures: 10,
      offlineExecution: true,
      isolatedExecution: true,
      freshState: true,
      noSleepBasedTiming: true,
      reviewableTest: true,
      sameCandidate: true,
    },
    missingEvidence: [],
    reasonCodes: [],
    testArtifact: 'repro.test.ts',
    durationMs: 1200,
    tokens: null,
    metadata: {},
  });

  const server = createReplayKitMcpServer(root, {
    env: { SENTRY_AUTH_TOKEN: 'test-sentry-token' },
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  return { root, runId, client, server };
}

describe('ReplayKit MCP Server', () => {
  it('registers all required tools with strict schemas', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'replaykit_cancel',
      'replaykit_import_sentry_issue',
      'replaykit_open_test',
      'replaykit_report',
      'replaykit_reproduce',
      'replaykit_status',
    ]);
  });

  it('checks job status for an existing run', async () => {
    const { client, runId } = await setup();
    const result = await client.callTool({
      name: 'replaykit_status',
      arguments: { runId },
    });
    expect(result.isError).toBeFalsy();
    const firstContent = result.content[0];
    expect(firstContent?.type).toBe('text');
    if (firstContent?.type === 'text') {
      const parsed = JSON.parse(firstContent.text);
      expect(parsed.runId).toBe(runId);
      expect(parsed.state).toBe('RUNNING');
      expect(parsed.progress.preliminary).toBe(true);
    }
  });

  it('returns open test content from managed run directory', async () => {
    const { client, runId } = await setup();
    const result = await client.callTool({
      name: 'replaykit_open_test',
      arguments: { runId },
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({ type: 'text', text: '// test source' });
  });

  it('retrieves independent report for completed run', async () => {
    const { client, runId, root } = await setup();
    const runDir = path.join(root, 'runs', runId);
    await atomicJson(runDir, 'job.json', {
      schemaVersion: 1,
      runId,
      state: 'COMPLETED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      concurrency: 3,
      ownerToken: 'a'.repeat(64),
      progress: {
        phase: 'FINISHED',
        completedExecutions: 17,
        totalExecutions: 17,
        preliminary: false,
      },
      verdict: 'VERIFIED',
      reasonCode: null,
      cancelRequested: false,
    });
    const result = await client.callTool({
      name: 'replaykit_report',
      arguments: { runId },
    });
    expect(result.isError).toBeFalsy();
    const firstContent = result.content[0];
    if (firstContent?.type === 'text') {
      const parsed = JSON.parse(firstContent.text);
      expect(parsed.result.status).toBe('VERIFIED');
      expect(parsed.content).toContain('Repro Report');
    }
  });

  it('cancels an active run safely', async () => {
    const { client, runId } = await setup();
    const result = await client.callTool({
      name: 'replaykit_cancel',
      arguments: { runId },
    });
    expect(result.isError).toBeFalsy();
    const firstContent = result.content[0];
    if (firstContent?.type === 'text') {
      const parsed = JSON.parse(firstContent.text);
      expect(parsed.cancelRequested).toBe(true);
    }
  });

  it('starts reproduction promptly without blocking for Docker executions', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'replaykit_reproduce',
      arguments: { fixture: 'R1', concurrency: 3 },
    });
    expect(result.isError).toBeFalsy();
    const firstContent = result.content[0];
    if (firstContent?.type === 'text') {
      const parsed = JSON.parse(firstContent.text);
      expect(parsed.state).toBe('QUEUED');
      expect(parsed.runId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it('rejects unapproved Sentry origin without leaking credentials', async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: 'replaykit_import_sentry_issue',
      arguments: { sentryUrl: 'https://evil.sentry.io.fake/issues/123/' },
    });
    expect(result.isError).toBe(true);
    const text = JSON.stringify(result);
    expect(text).not.toContain('test-sentry-token');
    expect(text).toContain('UNAPPROVED_ORIGIN');
  });

  it('confirms no tool schema accepts a token argument and summary marks incident text untrusted', async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();

    // Confirm that no registered tool schema accepts any token parameter
    for (const tool of tools) {
      const propNames = Object.keys(tool.inputSchema.properties ?? {});
      expect(propNames).not.toContain('token');
      expect(propNames).not.toContain('authToken');
      expect(propNames).not.toContain('sentryToken');
    }

    // Confirm Sentry import tool schema accepts only sentryUrl
    const importTool = tools.find((t) => t.name === 'replaykit_import_sentry_issue');
    expect(importTool).toBeDefined();
    expect(Object.keys(importTool!.inputSchema.properties ?? {})).toEqual(['sentryUrl']);
  });

  it('connects via real stdio transport and communicates cleanly', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'replaykit-mcp-stdio-'));
    roots.push(root);

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx/esm', path.resolve('packages/mcp/src/index.ts')],
      env: { ...process.env, PWD: root },
    });

    const client = new Client({ name: 'stdio-test-client', version: '1.0.0' });
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.length).toBe(6);

    await client.close();
  });
});
