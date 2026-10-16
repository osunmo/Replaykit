import { spawn } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}
/** No shell interpolation. Only the trusted supervisor constructs Docker arguments. */
export function docker(
  args: string[],
  options: { timeoutMs?: number; allowFailure?: boolean; input?: string } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new Error(`Docker command timed out: ${args[0]}`)),
      options.timeoutMs ?? 30000,
    );
    child.on('error', fail);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 1024 * 1024) fail(new Error('Docker stdout exceeded limit'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 1024 * 1024) fail(new Error('Docker stderr exceeded limit'));
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0 && !options.allowFailure)
        reject(new Error(`Docker ${args[0]} failed (${code}): ${stderr.trim() || stdout.trim()}`));
      else resolve({ stdout, stderr, code: code ?? -1 });
    });
    child.stdin.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EPIPE') fail(error);
    });
    child.stdin.end(options.input);
  });
}
