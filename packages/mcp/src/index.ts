import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createReplayKitMcpServer } from './server.js';

export async function startMcpServer(root: string = process.cwd()): Promise<void> {
  const server = createReplayKitMcpServer(root);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('ReplayKit MCP server running on stdio\n');
}

if (
  (process.argv[1] && process.argv[1].endsWith('index.ts')) ||
  process.argv[1]?.endsWith('index.js')
) {
  startMcpServer().catch((error) => {
    process.stderr.write(
      `ReplayKit MCP server fatal error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
