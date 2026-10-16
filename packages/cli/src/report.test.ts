import { describe, expect, it } from 'vitest';
import { reportMarkdown, safeRunId, readJson } from './report.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
describe('CLI artifact boundaries', () => {
  it('rejects run IDs that escape the runs directory', () => {
    expect(() => safeRunId('../benchmark/private')).toThrow();
    expect(() => safeRunId('C:\\private')).toThrow();
    expect(safeRunId('d4042161-5766-42ee-aa73-d2b728139045')).toBe(
      'd4042161-5766-42ee-aa73-d2b728139045',
    );
  });
  it('rejects oversized JSON before parsing it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'replaykit-unit-'));
    const file = path.join(dir, 'incident.json');
    await writeFile(file, ' '.repeat(1048577));
    await expect(readJson(file)).rejects.toThrow('1 MiB');
  });
  it('shows infrastructure errors without a success rate', () => {
    const text = reportMarkdown(
      {
        status: 'ERROR',
        incidentId: 'R1',
        reasonCodes: ['EXECUTION_ERROR'],
        checks: { buggyFails: null },
        durationMs: 5,
      },
      [],
    );
    expect(text).toContain('ERROR');
    expect(text).toContain('unavailable');
    expect(text).not.toContain('100%');
  });
});
