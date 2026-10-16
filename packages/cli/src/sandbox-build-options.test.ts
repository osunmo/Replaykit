import { describe, expect, it } from 'vitest';
import { parseSandboxBuildOptions } from './sandbox-build-options.js';

describe('sandbox build options', () => {
  it('keeps standard PostgreSQL initialization as the default', () => {
    expect(parseSandboxBuildOptions([])).toEqual({ postgresMode: 'initdb' });
  });

  it('requires an explicit template choice and accepts an explicit standard choice', () => {
    expect(parseSandboxBuildOptions(['--postgres-mode', 'template-copy'])).toEqual({
      postgresMode: 'template-copy',
    });
    expect(parseSandboxBuildOptions(['--postgres-mode', 'initdb'])).toEqual({
      postgresMode: 'initdb',
    });
  });

  it('rejects ambiguous or malformed build options before Docker can run', () => {
    for (const args of [
      ['--postgres-mode'],
      ['--postgres-mode', '--other'],
      ['--postgres-mode', ''],
      ['--postgres-mode', 'template'],
      ['--postgres-mode', 'INITDB'],
      ['--postgres-mode', 'template-copy', '--postgres-mode', 'initdb'],
      ['--postgres-mode', 'initdb', '--postgres-mode', 'initdb'],
      ['--postgres-mode', 'initdb', '--unknown', 'value'],
      ['--postgres-mode=template-copy'],
      ['--unknown'],
      ['template-copy'],
    ])
      expect(() => parseSandboxBuildOptions(args), JSON.stringify(args)).toThrow();
  });
});
