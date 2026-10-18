import * as vscode from 'vscode';
import path from 'node:path';
import type { JobStatus, ReplayRuntime } from '../../../packages/runtime/src/index.js';

export class RunTreeItem extends vscode.TreeItem {
  constructor(
    public readonly job: JobStatus,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.Collapsed,
  ) {
    super(job.runId.slice(0, 8), collapsibleState);
    this.contextValue =
      job.state === 'RUNNING' || job.state === 'QUEUED' ? 'activeRun' : 'completedRun';
    this.tooltip = `Run ID: ${job.runId}\nState: ${job.state}\nVerdict: ${job.verdict ?? 'none'}`;

    if (job.state === 'RUNNING' || job.state === 'QUEUED') {
      const preliminaryText = job.progress.preliminary
        ? ' [PRELIMINARY failing test observed]'
        : '';
      this.description = `${job.state}: ${job.progress.phase} (${job.progress.completedExecutions}/${job.progress.totalExecutions})${preliminaryText}`;
      this.iconPath = new vscode.ThemeIcon('sync~spin');
    } else if (job.state === 'COMPLETED') {
      this.description = job.verdict ?? 'COMPLETED';
      if (job.verdict === 'VERIFIED') {
        this.iconPath = new vscode.ThemeIcon(
          'pass-filled',
          new vscode.ThemeColor('testing.iconPassed'),
        );
      } else if (job.verdict === 'PARTIAL') {
        this.iconPath = new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('testing.iconQueued'),
        );
      } else {
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
      }
    } else if (job.state === 'CANCELLED' || job.state === 'INTERRUPTED') {
      this.description = `${job.state} (${job.reasonCode ?? ''})`;
      this.iconPath = new vscode.ThemeIcon('circle-slash');
    } else {
      this.description = `FAILED (${job.reasonCode ?? 'ERROR'})`;
      this.iconPath = new vscode.ThemeIcon('error');
    }
  }
}

export class RunDetailItem extends vscode.TreeItem {
  constructor(label: string, description?: string, icon?: string, command?: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    if (description) this.description = description;
    if (icon) this.iconPath = new vscode.ThemeIcon(icon);
    if (command) this.command = command;
  }
}

export class RunsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly root: string,
    private readonly runtime: ReplayRuntime,
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      try {
        const jobs = await this.runtime.list(20);
        if (!jobs.length) {
          return [new RunDetailItem('No recent reproduction runs', 'Click "+" to run R1', 'info')];
        }
        return jobs.map((job) => new RunTreeItem(job));
      } catch (error) {
        return [
          new RunDetailItem(
            'Failed to list runs',
            error instanceof Error ? error.message : String(error),
            'error',
          ),
        ];
      }
    }

    if (element instanceof RunTreeItem) {
      const items: vscode.TreeItem[] = [];
      const job = element.job;

      // Status detail item
      items.push(
        new RunDetailItem(
          `Status: ${job.state}`,
          job.verdict
            ? `Verdict: ${job.verdict}`
            : job.reasonCode
              ? `Reason: ${job.reasonCode}`
              : undefined,
          job.state === 'COMPLETED' && job.verdict === 'VERIFIED' ? 'pass' : 'info',
        ),
      );

      // Preliminary status warning if running
      if (job.progress.preliminary && (job.state === 'RUNNING' || job.state === 'QUEUED')) {
        items.push(
          new RunDetailItem(
            'Preliminary observation',
            'Failing test observed once; strict verification matrix in progress',
            'eye',
          ),
        );
      }

      // Open regression test action
      items.push(
        new RunDetailItem('Open repro.test.ts', 'Review generated test', 'file-code', {
          command: 'replaykit.openTest',
          title: 'Open Generated Regression Test',
          arguments: [job.runId],
        }),
      );

      // Open report action
      if (job.state === 'COMPLETED') {
        items.push(
          new RunDetailItem('Open report.md', 'View independent evaluation report', 'output', {
            command: 'replaykit.openReport',
            title: 'Open Verification Report',
            arguments: [job.runId],
          }),
        );

        // Fetch report checks to display failing gates if any
        try {
          const report = await this.runtime.report(job.runId);
          const checks = report.result.checks;
          const failingChecks = Object.entries(checks)
            .filter(([, v]) => v === false)
            .map(([k]) => k);

          if (failingChecks.length > 0) {
            items.push(
              new RunDetailItem(
                `Failing Gates (${failingChecks.length})`,
                failingChecks.join(', '),
                'close',
              ),
            );
          }
        } catch {
          // Report may still be loading or incomplete
        }
      }

      // Navigate to target application source
      const appSource = path.join(this.root, 'apps', 'checkout-api', 'src', 'payments.ts');
      items.push(
        new RunDetailItem('Navigate to Source', 'payments.ts (createPayment)', 'go-to-file', {
          command: 'vscode.open',
          title: 'Open Source',
          arguments: [vscode.Uri.file(appSource)],
        }),
      );

      // Cancel button if active
      if (job.state === 'RUNNING' || job.state === 'QUEUED') {
        items.push(
          new RunDetailItem('Cancel Job', 'Stop reproduction executions', 'stop-circle', {
            command: 'replaykit.cancelJob',
            title: 'Cancel Reproduction Job',
            arguments: [job.runId],
          }),
        );
      }

      return items;
    }

    return [];
  }
}
