// Static source-data tests; these strings are never executed as candidate code.
import { describe, expect, it } from 'vitest';
import { extractAddedTest } from './candidate.js';

const base = "describe('suite', () => {\n  it('control', () => expect('x y').toBe('x y'));\n});\n";
const block = "it('regression', async () => {\n    await subject();\n  });";
const added = (insertion: string) => base.replace('\n});', '\n  ' + insertion + '\n});');
describe('exact single-added-test candidate mapping', () => {
  it('extracts the complete newly executed block without changing controls', () => {
    expect(extractAddedTest(base, added(block), 'regression')).toBe(block);
  });
  it('rejects a prefix insertion that only renames an existing control', () => {
    expect(() =>
      extractAddedTest(base, base.replace("'control'", "'new-control'"), 'new-control'),
    ).toThrow();
  });
  it('accepts an honest insertion sharing the next control statement prefix', () => {
    const patched = base.replace("it('control'", block + "\n  it('control'");
    expect(extractAddedTest(base, patched, 'regression')).toBe(block);
  });
  it('rejects insertion that changes the parse of an existing control expression', () => {
    const original = "describe('suite', () => {\n  subject()\n  (input);\n});";
    const patched = original.replace('\n  (input)', '\n  ' + block + '\n  (input)');
    expect(() => extractAddedTest(original, patched, 'regression')).toThrow();
  });
  it.each(["'use strict';", "'custom directive';\n  'use strict';"])(
    'preserves the directive prologue %s',
    (directives) => {
      const original = base.replace("  it('control'", directives + "\n  it('control'");
      const changed = original.replace(directives, block + '\n  ' + directives);
      expect(() => extractAddedTest(original, changed, 'regression')).toThrow();
      const afterDirectives = original.replace("  it('control'", block + "\n  it('control'");
      expect(extractAddedTest(original, afterDirectives, 'regression')).toBe(block);
    },
  );
  it.each([
    ['changed control', () => added(block).replace("toBe('x y')", "toBe('xy')")],
    ['new import', () => "import dangerous from 'fs';\n" + added(block)],
    ['new hook', () => added('beforeEach(() => dangerous());\n' + block)],
    ['new helper', () => added('function helper() { dangerous(); }\n' + block)],
    ['second test', () => added(block + "\nit('other', () => dangerous());")],
    ['duplicate title', () => added(block + '\n' + block)],
    ['disabled test', () => added(block.replace("it('", "it.skip('"))],
    ['missing test', () => base],
    ['malformed source', () => added(block).slice(0, -5)],
  ])('rejects %s', (_mode, alter) => {
    expect(() => extractAddedTest(base, alter(), 'regression')).toThrow();
  });
  it('rejects a test registered inside an existing test callback', () => {
    const existing = "describe('suite', () => { it('control', () => {\n}); });";
    const changed = existing.replace('\n}', '\n' + block + '\n}');
    expect(() => extractAddedTest(existing, changed, 'regression')).toThrow();
  });
  it('rejects a title already present in pinned controls', () => {
    expect(() => extractAddedTest(base, added(block), 'control')).toThrow();
  });
  it('retains every byte of unsafe candidate content for the unchanged static gate', () => {
    const unsafe = "it('regression', () => { throw new Error('always'); });";
    expect(extractAddedTest(base, added(unsafe), 'regression')).toBe(unsafe);
  });
});
