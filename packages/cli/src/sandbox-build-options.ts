export function parseSandboxBuildOptions(args: readonly string[]): {
  postgresMode: 'initdb' | 'template-copy';
} {
  let postgresMode: 'initdb' | 'template-copy' = 'initdb';
  let modeProvided = false;
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]!;
    if (name !== '--postgres-mode') throw new Error(`Unknown sandbox build option: ${name}`);
    if (modeProvided) throw new Error('Duplicate sandbox build option: --postgres-mode');
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing --postgres-mode');
    if (value !== 'initdb' && value !== 'template-copy')
      throw new Error('PostgreSQL mode must be initdb or template-copy');
    postgresMode = value;
    modeProvided = true;
  }
  return { postgresMode };
}
