import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createRuntime, RuntimeError } from '../../runtime/src/index.js';
import { SentryImportError } from '../../sentry/src/errors.js';
import { importedIncident, importSentryManaged } from '../../cli/src/sentry-imports.js';

export interface McpServerOptions {
  env?: Record<string, string | undefined>;
}

export function createReplayKitMcpServer(root: string, options: McpServerOptions = {}): McpServer {
  const server = new McpServer({
    name: 'replaykit-mcp',
    version: '0.1.0',
  });

  const runtime = createRuntime(root);
  const env = options.env ?? process.env;

  server.registerTool(
    'replaykit_reproduce',
    {
      description:
        'Start an isolated incident reproduction job for R1 or an imported Sentry incident. Returns runId and status immediately without blocking.',
      inputSchema: {
        fixture: z
          .enum(['R1'])
          .optional()
          .describe('Supported incident fixture identifier (e.g. R1)'),
        importId: z.string().uuid().optional().describe('Imported incident UUID'),
        concurrency: z
          .number()
          .int()
          .min(1)
          .max(3)
          .optional()
          .describe('Execution concurrency (1-3, default 3)'),
      },
    },
    async (input) => {
      try {
        if (!input.fixture && !input.importId) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Either "fixture" (e.g. "R1") or "importId" must be provided.',
              },
            ],
          };
        }
        if (input.fixture && input.importId) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Cannot specify both "fixture" and "importId". Choose one.',
              },
            ],
          };
        }

        const concurrency = input.concurrency ?? 3;
        if (input.fixture === 'R1') {
          const job = await runtime.start({ fixture: 'R1', concurrency });
          return {
            content: [{ type: 'text', text: JSON.stringify(job, null, 2) }],
          };
        }

        const incident = await importedIncident(root, input.importId!);
        const job = await runtime.start({ incident, concurrency });
        return {
          content: [{ type: 'text', text: JSON.stringify(job, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof RuntimeError || error instanceof SentryImportError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Reproduction start failed: ${message}` }],
        };
      }
    },
  );

  server.registerTool(
    'replaykit_status',
    {
      description:
        'Check current status, execution phase, and preliminary/final verdict of a reproduction job.',
      inputSchema: {
        runId: z.string().uuid().describe('Reproduction run ID'),
      },
    },
    async (input) => {
      try {
        const status = await runtime.status(input.runId);
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof RuntimeError
            ? error.code
            : error instanceof Error
              ? error.message
              : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Status lookup failed: ${message}` }],
        };
      }
    },
  );

  server.registerTool(
    'replaykit_report',
    {
      description:
        'Retrieve independent judge report, verification matrix, and verdict checks for a completed run.',
      inputSchema: {
        runId: z.string().uuid().describe('Reproduction run ID'),
      },
    },
    async (input) => {
      try {
        const report = await runtime.report(input.runId);
        return {
          content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof RuntimeError
            ? error.code
            : error instanceof Error
              ? error.message
              : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Report lookup failed: ${message}` }],
        };
      }
    },
  );

  server.registerTool(
    'replaykit_open_test',
    {
      description:
        'Retrieve the generated reviewable regression test (repro.test.ts) for a reproduction run.',
      inputSchema: {
        runId: z.string().uuid().describe('Reproduction run ID'),
      },
    },
    async (input) => {
      try {
        const test = await runtime.openTest(input.runId);
        return {
          content: [{ type: 'text', text: test.content }],
        };
      } catch (error) {
        const message =
          error instanceof RuntimeError
            ? error.code
            : error instanceof Error
              ? error.message
              : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Test lookup failed: ${message}` }],
        };
      }
    },
  );

  server.registerTool(
    'replaykit_cancel',
    {
      description: 'Cancel an active reproduction job.',
      inputSchema: {
        runId: z.string().uuid().describe('Reproduction run ID to cancel'),
      },
    },
    async (input) => {
      try {
        const status = await runtime.cancel(input.runId);
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      } catch (error) {
        const message =
          error instanceof RuntimeError
            ? error.code
            : error instanceof Error
              ? error.message
              : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Cancellation failed: ${message}` }],
        };
      }
    },
  );

  server.registerTool(
    'replaykit_import_sentry_issue',
    {
      description:
        'Securely import, normalize, and redact an issue from Sentry via URL using configured credentials.',
      inputSchema: {
        sentryUrl: z.string().min(1).max(4096).describe('Full HTTPS Sentry issue URL'),
      },
    },
    async (input) => {
      try {
        const saved = await importSentryManaged(root, input.sentryUrl, env);
        return {
          content: [{ type: 'text', text: JSON.stringify(saved, null, 2) }],
        };
      } catch (error) {
        const code =
          error instanceof SentryImportError
            ? error.code
            : error instanceof Error
              ? error.message
              : String(error);
        return {
          isError: true,
          content: [{ type: 'text', text: `Sentry import failed: ${code}` }],
        };
      }
    },
  );

  return server;
}
