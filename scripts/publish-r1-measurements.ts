import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { publishMeasurement } from '../packages/cli/src/published-measurement.js';

const root = process.cwd();
const runIds = process.argv.slice(2).filter((arg) => arg !== '--');
if (!runIds.length)
  throw new Error('Usage: node --import tsx scripts/publish-r1-measurements.ts <run-id> ...');
if (new Set(runIds).size !== runIds.length) throw new Error('Duplicate run IDs are not allowed');
const records = [];
for (const runId of runIds) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId))
    throw new Error('Expected UUID run IDs');
  const directory = path.join(root, 'runs', runId);
  const read = async (file: string) =>
    JSON.parse(await readFile(path.join(directory, file), 'utf8')) as unknown;
  const [measurement, result] = await Promise.all([read('measurement.json'), read('result.json')]);
  let pipeline: unknown;
  try {
    pipeline = await read('pipeline.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if ((measurement as { runId?: unknown } | null)?.runId !== runId)
    throw new Error('Directory/measurement runId mismatch');
  records.push(publishMeasurement(measurement, result, pipeline));
}
const target = path.join(root, 'docs', 'measurements', 'r1-performance.json');
await mkdir(path.dirname(target), { recursive: true });
await writeFile(
  target,
  JSON.stringify(
    {
      schemaVersion: 1,
      scope: 'R1 local performance measurements; this artifact does not assert CI success.',
      timingNotes:
        'Wall time is elapsed smoke time. Per-stage and execution sums overlap under concurrency. Resource sampling can miss short-lived peaks and includes any other replaykit.run-labeled containers.',
      comparisonNotes:
        'No speedup is inferred automatically. Compare identical image IDs, candidate hash, repeat counts, and measurement conditions before attributing a runtime change to concurrency.',
      records,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(
  JSON.stringify(
    {
      published: 'docs/measurements/r1-performance.json',
      runs: records.map((record) => record.runId),
    },
    null,
    2,
  ) + '\n',
);
