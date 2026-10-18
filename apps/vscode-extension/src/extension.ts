import * as vscode from 'vscode';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { createRuntime } from '../../../packages/runtime/src/index.js';
import { RunsTreeDataProvider } from './runs-provider.js';
import { importSentryManaged, importedIncident } from '../../../packages/cli/src/sentry-imports.js';
import { SentryImportError } from '../../../packages/sentry/src/errors.js';

export function getWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0]!.uri.fsPath;
  }
  return process.cwd();
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const root = getWorkspaceRoot();
  const runtime = createRuntime(root);
  const runsProvider = new RunsTreeDataProvider(root, runtime);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('replaykit.runsView', runsProvider),
  );

  const pollJob = (runId: string) => {
    const timer = setInterval(async () => {
      try {
        const job = await runtime.status(runId);
        runsProvider.refresh();
        if (
          job.state === 'COMPLETED' ||
          job.state === 'FAILED' ||
          job.state === 'CANCELLED' ||
          job.state === 'INTERRUPTED'
        ) {
          clearInterval(timer);
          if (job.state === 'COMPLETED' && job.verdict === 'VERIFIED') {
            vscode.window
              .showInformationMessage(
                `ReplayKit: Incident reproduced with VERIFIED verdict! (Run: ${runId.slice(0, 8)})`,
                'Open Report',
                'Open Test',
              )
              .then((selection) => {
                if (selection === 'Open Report')
                  vscode.commands.executeCommand('replaykit.openReport', runId);
                if (selection === 'Open Test')
                  vscode.commands.executeCommand('replaykit.openTest', runId);
              });
          } else if (job.state === 'COMPLETED') {
            vscode.window
              .showWarningMessage(
                `ReplayKit: Finished with verdict ${job.verdict} (Run: ${runId.slice(0, 8)})`,
                'Open Report',
              )
              .then((sel) => {
                if (sel === 'Open Report')
                  vscode.commands.executeCommand('replaykit.openReport', runId);
              });
          } else {
            vscode.window.showErrorMessage(
              `ReplayKit: Job ${runId.slice(0, 8)} ended with ${job.state} (${job.reasonCode ?? 'unknown'})`,
            );
          }
        }
      } catch {
        clearInterval(timer);
      }
    }, 2000);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('replaykit.refreshRuns', () => {
      runsProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('replaykit.startReproduction', async () => {
      const selection = await vscode.window.showQuickPick(
        [
          {
            label: '$(zap) R1: Payment Retry Idempotency',
            description: 'Built-in buggy payment retry scenario',
            fixture: 'R1' as const,
          },
          {
            label: '$(cloud-download) From Imported Sentry Incident...',
            description: 'Enter an import UUID',
            fixture: undefined,
          },
        ],
        { placeHolder: 'Select an incident target to reproduce in isolated sandbox' },
      );

      if (!selection) return;

      try {
        if (selection.fixture === 'R1') {
          const job = await runtime.start({ fixture: 'R1', concurrency: 3 });
          vscode.window.showInformationMessage(
            `ReplayKit: Reproduction started (Run: ${job.runId.slice(0, 8)}). Execution matrix running in background...`,
          );
          runsProvider.refresh();
          pollJob(job.runId);
        } else {
          const importId = await vscode.window.showInputBox({
            prompt: 'Enter the UUID of a previously imported Sentry incident',
            placeHolder: 'e.g. 550e8400-e29b-41d4-a716-446655440000',
          });
          if (!importId) return;
          const incident = await importedIncident(root, importId);
          const job = await runtime.start({ incident, concurrency: 3 });
          vscode.window.showInformationMessage(
            `ReplayKit: Reproduction started for imported incident (Run: ${job.runId.slice(0, 8)})`,
          );
          runsProvider.refresh();
          pollJob(job.runId);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `ReplayKit: Failed to start reproduction: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('replaykit.openTest', async (runId?: string) => {
      if (!runId) {
        const jobs = await runtime.list(10);
        const pick = await vscode.window.showQuickPick(
          jobs.map((j) => ({ label: j.runId, description: `${j.state} ${j.verdict ?? ''}` })),
          { placeHolder: 'Select a run to view its generated test' },
        );
        if (!pick) return;
        runId = pick.label;
      }

      try {
        const test = await runtime.openTest(runId);
        const testUri = vscode.Uri.file(path.join(root, test.artifact));
        const doc = await vscode.workspace.openTextDocument(testUri);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(
          `ReplayKit: Could not open test: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('replaykit.openReport', async (runId?: string) => {
      if (!runId) {
        const jobs = await runtime.list(10);
        const pick = await vscode.window.showQuickPick(
          jobs.map((j) => ({ label: j.runId, description: `${j.state} ${j.verdict ?? ''}` })),
          { placeHolder: 'Select a completed run to view its report' },
        );
        if (!pick) return;
        runId = pick.label;
      }

      try {
        const rep = await runtime.report(runId);
        const reportUri = vscode.Uri.file(path.join(root, rep.artifact));
        const doc = await vscode.workspace.openTextDocument(reportUri);
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (error) {
        vscode.window.showErrorMessage(
          `ReplayKit: Could not open report: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('replaykit.cancelJob', async (runId?: string) => {
      if (!runId) {
        const jobs = (await runtime.list(10)).filter(
          (j) => j.state === 'RUNNING' || j.state === 'QUEUED',
        );
        if (!jobs.length) {
          vscode.window.showInformationMessage('No active reproduction jobs to cancel.');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          jobs.map((j) => ({ label: j.runId, description: j.state })),
          { placeHolder: 'Select a running job to cancel' },
        );
        if (!pick) return;
        runId = pick.label;
      }

      try {
        await runtime.cancel(runId);
        vscode.window.showInformationMessage(
          `ReplayKit: Cancel requested for job ${runId.slice(0, 8)}.`,
        );
        runsProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `ReplayKit: Failed to cancel job: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('replaykit.setSentryToken', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Enter Sentry Personal Access Token or Internal Integration Token',
        password: true,
        placeHolder: 'sntrys_...',
      });
      if (!token) return;
      await context.secrets.store('SENTRY_AUTH_TOKEN', token);
      vscode.window.showInformationMessage(
        'ReplayKit: Sentry token stored securely in SecretStorage.',
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('replaykit.importSentryIssue', async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Enter full HTTPS Sentry issue URL',
        placeHolder: 'https://sentry.io/organizations/my-org/issues/123456789/',
      });
      if (!url) return;

      let token = await context.secrets.get('SENTRY_AUTH_TOKEN');
      if (!token && process.env.SENTRY_AUTH_TOKEN) {
        token = process.env.SENTRY_AUTH_TOKEN;
      }
      if (!token) {
        token = await vscode.window.showInputBox({
          prompt:
            'Sentry token not found. Please enter your Sentry auth token (stored in SecretStorage):',
          password: true,
        });
        if (!token) return;
        await context.secrets.store('SENTRY_AUTH_TOKEN', token);
      }

      try {
        const saved = await importSentryManaged(root, url, { SENTRY_AUTH_TOKEN: token });
        const choice = await vscode.window.showInformationMessage(
          `ReplayKit: Sentry issue imported successfully! (Import ID: ${saved.importId.slice(0, 8)})`,
          'Reproduce Now',
          'Dismiss',
        );
        if (choice === 'Reproduce Now') {
          const incident = await importedIncident(root, saved.importId);
          const job = await runtime.start({ incident, concurrency: 3 });
          vscode.window.showInformationMessage(
            `ReplayKit: Reproduction started (Run: ${job.runId.slice(0, 8)})`,
          );
          runsProvider.refresh();
          pollJob(job.runId);
        }
      } catch (error) {
        const message =
          error instanceof SentryImportError
            ? error.code
            : error instanceof Error
              ? error.message
              : String(error);
        vscode.window.showErrorMessage(`ReplayKit: Sentry import failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('replaykit.configureMcp', async () => {
      try {
        const currentRoot = getWorkspaceRoot();
        const cursorConfigDir = path.join(currentRoot, '.cursor');
        await mkdir(cursorConfigDir, { recursive: true });
        const mcpConfigFile = path.join(cursorConfigDir, 'mcp.json');
        const mcpServerPath = path.join(currentRoot, 'packages', 'mcp', 'src', 'index.ts');

        const config = {
          mcpServers: {
            replaykit: {
              command: process.execPath,
              args: ['--import', 'tsx/esm', mcpServerPath],
              env: {
                SENTRY_AUTH_TOKEN: (await context.secrets.get('SENTRY_AUTH_TOKEN')) ?? undefined,
              },
            },
          },
        };

        await writeFile(mcpConfigFile, JSON.stringify(config, null, 2) + '\n');
        vscode.window.showInformationMessage(
          `ReplayKit: Configured MCP server in .cursor/mcp.json. Cursor can now invoke ReplayKit tools.`,
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `ReplayKit: Failed to write MCP config: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
}

export function deactivate(): void {}
