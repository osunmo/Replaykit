import { parseConcurrency } from './concurrency.js';

export function parseMeasurementOptions(args: readonly string[]): {
  label: string;
  concurrency: number;
  sampling: 'on' | 'off';
} {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]!;
    if (!['--label', '--concurrency', '--sampling'].includes(name))
      throw new Error(`Unknown measurement option: ${name}`);
    if (options.has(name)) throw new Error(`Duplicate measurement option: ${name}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing ${name}`);
    options.set(name, value);
  }
  const sampling = options.get('--sampling') ?? 'on';
  if (sampling !== 'on' && sampling !== 'off') throw new Error('Sampling must be on or off');
  return {
    label: options.get('--label') ?? 'measurement',
    concurrency: parseConcurrency(options.get('--concurrency')),
    sampling,
  };
}
