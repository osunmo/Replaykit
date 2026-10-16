import { describe, expect, it } from 'vitest';
import { parseMeasurementOptions } from './measurement-options.js';

describe('measurement command options', () => {
  it('enables sampling by default and accepts an explicitly unsampled sequential measurement', () => {
    expect(parseMeasurementOptions([])).toEqual({
      label: 'measurement',
      concurrency: 3,
      sampling: 'on',
    });
    expect(
      parseMeasurementOptions([
        '--sampling',
        'off',
        '--concurrency',
        '1',
        '--label',
        'sequential-off',
      ]),
    ).toEqual({ label: 'sequential-off', concurrency: 1, sampling: 'off' });
    expect(parseMeasurementOptions(['--sampling', 'on', '--concurrency', '6']).sampling).toBe('on');
  });

  it('rejects invalid, missing, ambiguous, and unknown options before a run can start', () => {
    for (const args of [
      ['--sampling', 'false'],
      ['--sampling', 'OFF'],
      ['--sampling'],
      ['--sampling', '--concurrency', '3'],
      ['--sampling', 'off', '--sampling', 'on'],
      ['--concurrency', '0'],
      ['--concurrency', '11'],
      ['--concurrency', '1.5'],
      ['--concurrency', '0x3'],
      ['--sampling-off'],
      ['off'],
    ])
      expect(() => parseMeasurementOptions(args), JSON.stringify(args)).toThrow();
  });
});
