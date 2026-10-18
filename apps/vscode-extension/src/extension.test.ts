import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunsTreeDataProvider, RunTreeItem } from './runs-provider.js';
import { createRuntime } from '../../../packages/runtime/src/index.js';
import { atomicJson } from '../../../packages/runtime/src/storage.js';
import type { StoredJob } from '../../../packages/runtime/src/contracts.js';
import { activate } from './extension.js';

// Mock vscode module for standalone unit testing
vi.mock('vscode', () => {
  const subscriptions: Array<{ dispose: () => void }> = [];
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const secrets = new Map<string, string>();

  class TreeItem {
    label?: string;
    description?: string;
    tooltip?: string;
    contextValue?: string;
    iconPath?: unknown;
    command?: unknown;
    constructor(
      label: string,
      public collapsibleState = 0,
    ) {
      this.label = label;
    }
  }

  class ThemeIcon {
    constructor(
      public id: string,
      public color?: unknown,
    ) {}
  }
  class ThemeColor {
    constructor(public id: string) {}
  }
  class EventEmitter {
    event = vi.fn();
    fire = vi.fn();
  }
  class Uri {
    static file(f: string) {
      return { fsPath: f, scheme: 'file' };
    }
  }

  return {
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon,
    ThemeColor,
    EventEmitter,
    Uri,
    window: {
      registerTreeDataProvider: vi.fn(),
      showInformationMessage: vi.fn(async () => undefined),
      showWarningMessage: vi.fn(async () => undefined),
      showErrorMessage: vi.fn(async () => undefined),
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      showTextDocument: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn((name: string, handler: (...args: unknown[]) => unknown) => {
        commands.set(name, handler);
        return { dispose: () => commands.delete(name) };
      }),
      executeCommand: vi.fn(async (name: string, ...args: unknown[]) => {
        const handler = commands.get(name);
        if (handler) return handler(...args);
      }),
    },
    workspace: {
      workspaceFolders: undefined as unknown[] | undefined,
      openTextDocument: vi.fn(async (uri: { fsPath: string }) => ({ uri })),
    },
    __commands: commands,
    __secrets: secrets,
    __subscriptions: subscriptions,
  };
});

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function setupFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'replaykit-ext-test-'));
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
      completedExecutions: 4,
      totalExecutions: 17,
      preliminary: true,
    },
    verdict: null,
    reasonCode: null,
    cancelRequested: false,
  };
  await atomicJson(runDir, 'job.json', job);
  await writeFile(path.join(runDir, 'repro.test.ts'), '// repro code');
  await writeFile(path.join(runDir, 'report.md'), '# Repro Report');

  const runtime = createRuntime(root);
  return { root, runId, job, runtime, runDir };
}

describe('RunsTreeDataProvider', () => {
  it('displays active running job with honest preliminary status without claiming VERIFIED', async () => {
    const { root, runtime } = await setupFixture();
    const provider = new RunsTreeDataProvider(root, runtime);

    const rootItems = await provider.getChildren();
    expect(rootItems.length).toBe(1);

    const item = rootItems[0] as RunTreeItem;
    expect(item.label).toBeDefined();
    expect(item.description).toContain('RUNNING: VERIFYING (4/17)');
    expect(item.description).toContain('PRELIMINARY failing test observed');
    expect(item.contextValue).toBe('activeRun');

    // Children of active run
    const children = await provider.getChildren(item);
    const labels = children.map((c) => c.label);
    expect(labels).toContain('Status: RUNNING');
    expect(labels).toContain('Preliminary observation');
    expect(labels).toContain('Open repro.test.ts');
    expect(labels).toContain('Navigate to Source');
    expect(labels).toContain('Cancel Job');
  });

  it('renders completed VERIFIED job honestly with report actions and source navigation', async () => {
    const { root, runtime, runDir, job } = await setupFixture();
    await atomicJson(runDir, 'job.json', {
      ...job,
      state: 'COMPLETED',
      verdict: 'VERIFIED',
      progress: {
        phase: 'FINISHED',
        completedExecutions: 17,
        totalExecutions: 17,
        preliminary: false,
      },
    });
    await atomicJson(runDir, 'result.json', {
      schemaVersion: 1,
      incidentId: 'R1',
      runId: job.runId,
      status: 'VERIFIED',
      telemetryTier: 'full',
      failureMatch: {
        type: 'DuplicatePaymentError',
        topApplicationFrame: 'payments/createPayment',
      },
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
      durationMs: 1500,
      tokens: null,
      metadata: {},
    });

    const provider = new RunsTreeDataProvider(root, runtime);
    const rootItems = await provider.getChildren();
    const item = rootItems[0] as RunTreeItem;
    expect(item.description).toBe('VERIFIED');
    expect(item.contextValue).toBe('completedRun');

    const children = await provider.getChildren(item);
    const labels = children.map((c) => c.label);
    expect(labels).toContain('Status: COMPLETED');
    expect(labels).toContain('Open report.md');
    expect(labels).toContain('Open repro.test.ts');
    expect(labels).toContain('Navigate to Source');
    expect(labels).not.toContain('Cancel Job');
  });

  it('shows empty state when no runs exist', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'replaykit-ext-empty-'));
    roots.push(root);
    const runtime = createRuntime(root);
    const provider = new RunsTreeDataProvider(root, runtime);

    const items = await provider.getChildren();
    expect(items.length).toBe(1);
    expect(items[0]?.label).toContain('No recent reproduction runs');
  });
});

describe('Extension activation and commands', () => {
  it('activates extension and registers all required commands', async () => {
    const { root } = await setupFixture();
    const vscode = await import('vscode');
    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: { fsPath: root } },
    ];

    const secrets = new Map<string, string>();
    const context = {
      subscriptions: [] as unknown[],
      secrets: {
        get: vi.fn(async (key: string) => secrets.get(key)),
        store: vi.fn(async (key: string, val: string) => {
          secrets.set(key, val);
        }),
        delete: vi.fn(async (key: string) => {
          secrets.delete(key);
        }),
      },
    };

    await activate(context as unknown as import('vscode').ExtensionContext);

    const registered = Array.from(
      (vscode as unknown as { __commands: Map<string, unknown> }).__commands.keys(),
    );
    expect(registered).toContain('replaykit.refreshRuns');
    expect(registered).toContain('replaykit.startReproduction');
    expect(registered).toContain('replaykit.openTest');
    expect(registered).toContain('replaykit.openReport');
    expect(registered).toContain('replaykit.cancelJob');
    expect(registered).toContain('replaykit.setSentryToken');
    expect(registered).toContain('replaykit.importSentryIssue');
    expect(registered).toContain('replaykit.configureMcp');
  });

  it('configures MCP in .cursor/mcp.json cleanly', async () => {
    const { root } = await setupFixture();
    const vscode = await import('vscode');
    (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: { fsPath: root } },
    ];

    await vscode.commands.executeCommand('replaykit.configureMcp');

    const mcpConfigPath = path.join(root, '.cursor', 'mcp.json');
    const content = JSON.parse(await readFile(mcpConfigPath, 'utf8'));
    expect(content.mcpServers.replaykit).toBeDefined();
    expect(content.mcpServers.replaykit.args).toContain(
      path.join(root, 'packages', 'mcp', 'src', 'index.ts'),
    );
  });
});
