import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { createServer } from 'node:net';
import { RuntimeError } from './contracts.js';

/** OS-owned exclusivity only: loopback listener destroys connections and exposes no RPC. */
export async function acquireExecutionLease(root: string): Promise<() => Promise<void>> {
  let canonical = await realpath(root);
  if (process.platform === 'win32') canonical = canonical.toLowerCase();
  const port = 49152 + (createHash('sha256').update(canonical).digest().readUInt16BE(0) % 16384);
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => reject(new RuntimeError('RUNTIME_BUSY')));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
  });
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
