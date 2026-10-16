import { expect, it } from 'vitest';
import { relativeArtifactPath } from './publication.js';

it('prints portable relative artifact paths on Windows and POSIX', () => {
  expect(
    relativeArtifactPath(
      'C:\\Users\\person\\repo',
      'C:\\Users\\person\\repo\\runs\\abc\\report.md',
    ),
  ).toBe('runs/abc/report.md');
  expect(relativeArtifactPath('/home/person/repo', '/home/person/repo/runs/abc/report.md')).toBe(
    'runs/abc/report.md',
  );
});

it('refuses a cross-volume absolute path in a portable report', () => {
  expect(() => relativeArtifactPath('C:\\repo', 'D:\\private\\report.md')).toThrow('relative');
});
