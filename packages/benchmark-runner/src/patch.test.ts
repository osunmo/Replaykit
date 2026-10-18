// Patch text is inspected as data; no patch is applied or executed on the host.
import { describe, expect, it } from 'vitest';
import { validatePatch } from './patch.js';

const patch = (file: string) =>
  `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+new\n`;
describe('external patch path envelope', () => {
  it('allows the empty buggy diff and an explicitly allowlisted source diff', () => {
    expect(validatePatch('', ['src/app.ts'])).toEqual([]);
    expect(validatePatch(patch('src/app.ts'), ['src/app.ts'])).toEqual(['src/app.ts']);
  });
  it.each([
    '../escape',
    '/escape',
    'src/../../escape',
    '.git/config',
    'node_modules/harness.js',
    'test/official.ts',
  ])('rejects a variant touching %s', (file) => {
    expect(() => validatePatch(patch(file), ['src/app.ts'])).toThrow();
  });
  it.each([
    patch('src/app.ts').replace('+++ b/src/app.ts', '+++ /tmp/escape'),
    patch('src/app.ts').replace('b/src/app.ts', 'b/src/other.ts'),
    patch('src/app.ts').replace('@@ -1 +1 @@', 'new file mode 120000\n@@ -1 +1 @@'),
    patch('src/app.ts').replace('100644', '120000'),
    patch('src/app.ts').replace('100644', '160000'),
    patch('src/app.ts') + 'GIT binary patch\nliteral 1\n',
    patch('src/app.ts') + '\0',
    patch('src/app.ts') + patch('src/app.ts'),
    'not a git diff',
  ])('rejects malformed, binary, link or mismatched patch metadata', (text) => {
    expect(() => validatePatch(text, ['src/app.ts'])).toThrow();
  });
  it('rejects an oversized patch', () => {
    expect(() => validatePatch(patch('src/app.ts') + 'x'.repeat(262144), ['src/app.ts'])).toThrow();
  });
});
