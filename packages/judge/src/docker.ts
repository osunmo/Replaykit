import { spawn, execFileSync } from 'node:child_process';

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
  durationMs?: number;
}

function killProcessTree(pid: number, child: ReturnType<typeof spawn>): void {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      try {
        child.kill();
      } catch {}
    }
  }
}

/** No shell interpolation. Only the trusted supervisor constructs Docker arguments. */
export function docker(
  args: string[],
  options: { timeoutMs?: number; allowFailure?: boolean; input?: string } = {},
): Promise<CommandResult> {
  const startTime = Date.now();
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
      if (child.pid) {
        killProcessTree(child.pid, child);
      } else {
        child.kill();
      }
      reject(error);
    };
    const timer = setTimeout(
      () => {
        const timeoutError = new Error(`Docker command timed out: ${args[0]}`);
        (timeoutError as NodeJS.ErrnoException).code = 'ETIMEDOUT';
        (timeoutError as { durationMs?: number }).durationMs = Date.now() - startTime;
        (timeoutError as { stderr?: string }).stderr = stderr;
        (timeoutError as { stdout?: string }).stdout = stdout;
        fail(timeoutError);
      },
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
      const durationMs = Date.now() - startTime;
      if (code !== 0 && !options.allowFailure) {
        const error = new Error(`Docker ${args[0]} failed (${code}): ${stderr.trim() || stdout.trim()}`);
        (error as NodeJS.ErrnoException).code = String(code);
        (error as { durationMs?: number }).durationMs = durationMs;
        (error as { stderr?: string }).stderr = stderr;
        (error as { stdout?: string }).stdout = stdout;
        reject(error);
      } else resolve({ stdout, stderr, code: code ?? -1, durationMs });
    });
    child.stdin.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EPIPE') fail(error);
    });
    child.stdin.end(options.input);
  });
}
