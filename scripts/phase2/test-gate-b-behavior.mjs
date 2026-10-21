import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:\/)/, ''));
const temporary = mkdtempSync(path.join(os.tmpdir(), 'replaykit-gate-b-behavior-'));
const names = [
  'queueMicrotask',
  'structuredClone',
  'atob',
  'btoa',
  'performance',
  'fetch',
  'navigator',
  'crypto',
];
const run = (args, env = process.env) => {
  const result = spawnSync(process.execPath, args, {
    cwd: temporary,
    env,
    encoding: 'utf8',
    timeout: 10000,
  });
  if (result.error) throw result.error;
  return result;
};

try {
  const probeSource = readFileSync(path.join(here, 'gate-b-probe.cjs'), 'utf8');
  assert.doesNotMatch(probeSource, /deepStrictEqual/);
  copyFileSync(path.join(here, 'gate-b-probe.cjs'), path.join(temporary, 'gate-b-probe.cjs'));
  writeFileSync(
    path.join(temporary, 'index.js'),
    `
'use strict';
exports.parse = function (input) {
  if (typeof input === 'string') return { a: { b: 'c' } };
  if (process.env.VARIANT === 'buggy') throw new TypeError('source.hasOwnProperty is not a function');
  const nested = Object.assign(Object.create(null), { b: process.env.VARIANT === 'wrong' ? 'wrong' : 'c' });
  return { a: nested };
};
`,
  );
  const fixed = run(['gate-b-probe.cjs'], { ...process.env, VARIANT: 'fixed' });
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.match(fixed.stdout, /"event":"issue33-assertion","passed":true/);
  assert.doesNotMatch(fixed.stdout, /issue33-error/);
  const buggy = run(['gate-b-probe.cjs'], { ...process.env, VARIANT: 'buggy' });
  assert.equal(buggy.status, 1);
  assert.match(buggy.stdout, /"event":"issue33-error"/);
  assert.match(buggy.stderr, /TypeError: source\.hasOwnProperty is not a function/);
  const wrong = run(['gate-b-probe.cjs'], { ...process.env, VARIANT: 'wrong' });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stdout, /"event":"issue33-error"/);

  mkdirSync(path.join(temporary, 'node_modules', 'lab', 'lib'), { recursive: true });
  copyFileSync(
    path.join(here, 'gate-b-lab-adaptation.cjs'),
    path.join(temporary, 'gate-b-lab-adaptation.cjs'),
  );
  writeFileSync(
    path.join(temporary, 'node_modules', 'lab', 'lib', 'leaks.js'),
    `
let current = ${JSON.stringify(names)};
exports.detect = () => current.slice();
exports.set = next => { current = next.slice(); };
`,
  );
  const adaptation = run([
    '-r',
    './gate-b-lab-adaptation.cjs',
    '-e',
    `
const assert = require('node:assert/strict');
const leaks = require('./node_modules/lab/lib/leaks');
assert.deepEqual(leaks.detect(), []);
leaks.set([...${JSON.stringify(names)}, 'unexpectedGlobal']);
assert.deepEqual(leaks.detect(), ['unexpectedGlobal']);
leaks.set(${JSON.stringify(names)});
globalThis.fetch = setTimeout;
assert.deepEqual(leaks.detect(), ['fetch']);
`,
  ]);
  assert.equal(adaptation.status, 0, adaptation.stderr);
  assert.match(adaptation.stderr, /gate-b-lab-adaptation:/);
  process.stdout.write('Gate B probe/adaptation regression: PASS\n');
} finally {
  const relative = path.relative(os.tmpdir(), temporary);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to remove temporary test directory outside system temp');
  }
  rmSync(temporary, { recursive: true, force: true });
}
