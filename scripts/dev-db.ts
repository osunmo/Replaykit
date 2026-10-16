import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDevelopmentEnvironment } from './dev-env.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const [action, ...extra] = process.argv.slice(2);
if (!['up', 'down', 'test', 'api'].includes(action ?? '') || (action !== 'test' && extra.length)) {
  process.stderr.write('Usage: tsx scripts/dev-db.ts <up|down|test|api>\n');
  process.exitCode = 1;
} else {
  try {
    const local = await loadDevelopmentEnvironment(root);
    let command = process.execPath;
    let args: string[];
    if (action === 'up' || action === 'down') {
      command = 'docker';
      args = [
        'compose',
        '--project-directory',
        root,
        '--env-file',
        path.join(root, '.env'),
        ...(action === 'up' ? ['up', '-d', '--wait', 'postgres'] : ['down']),
      ];
    } else if (action === 'test') {
      args = [
        path.join(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        'vitest.integration.config.ts',
        ...extra,
      ];
    } else {
      args = ['--import', 'tsx', path.join(root, 'apps/checkout-api/src/bootstrap.ts')];
    }
    process.exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: root,
        env: { ...process.env, ...local },
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
      });
      const interrupt = () => child.kill('SIGINT');
      process.once('SIGINT', interrupt);
      child.once('error', reject);
      child.once('close', (code) => {
        process.removeListener('SIGINT', interrupt);
        resolve(code ?? 1);
      });
    });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Local development command failed'}\n`,
    );
    process.exitCode = 1;
  }
}
