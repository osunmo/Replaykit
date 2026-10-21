import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const verifier = path.join(here, 'verify-gate-b-tap.mjs');
const temporary = mkdtempSync(path.join(os.tmpdir(), 'replaykit-gate-b-tap-'));
const globals = [
  'queueMicrotask',
  'structuredClone',
  'atob',
  'btoa',
  'performance',
  'fetch',
  'navigator',
  'crypto',
];
function fixture(role, options = {}) {
  const tests = Array.from({ length: 56 }, (_, index) => {
    const id = index + 1;
    const title = id === 40 ? 'parse parses plain objects correctly' : `test ${id}`;
    const failed = role === 'buggy' && (id === 40 || options.extraFail === id);
    return `${failed ? 'not ok' : 'ok'} ${id} ${options.skip === id ? 'SKIP ' : ''}${title}`;
  });
  const lines = [
    '1..56',
    ...tests,
    ...(role === 'buggy'
      ? [
          '  TypeError: source.hasOwnProperty is not a function',
          '  at exports.clone (/case/lib/utils.js:47:20)',
        ]
      : []),
    '# tests 56',
    `# pass ${role === 'buggy' ? 55 : 56}`,
    `# fail ${role === 'buggy' ? 1 : 0}`,
    '# skipped 0',
    '# todo 0',
    '',
  ];
  const err = [
    'gate-b-lab-adaptation:' +
      JSON.stringify({
        schemaVersion: 1,
        mode: 'exact-eight-unchanged-node-globals',
        allowed: globals,
      }),
    'gate-b-lab-leaks:' +
      JSON.stringify({ remaining: options.extraLeak ? ['unexpectedGlobal'] : [] }),
    '',
  ];
  return { stdout: lines.join('\n'), stderr: err.join('\n') };
}
function verify(role, data, label) {
  const stdout = path.join(temporary, label + '.stdout');
  const stderr = path.join(temporary, label + '.stderr');
  writeFileSync(stdout, data.stdout);
  writeFileSync(stderr, data.stderr);
  const result = spawnSync(process.execPath, [verifier, role, stdout, stderr], {
    encoding: 'utf8',
    timeout: 10000,
  });
  if (result.error) throw result.error;
  return result;
}
try {
  const buggy = verify('buggy', fixture('buggy'), 'buggy');
  assert.equal(buggy.status, 0, buggy.stderr);
  const fixed = verify('fixed', fixture('fixed'), 'fixed');
  assert.equal(fixed.status, 0, fixed.stderr);
  const buggyReport = JSON.parse(buggy.stdout);
  const fixedReport = JSON.parse(fixed.stdout);
  assert.equal(buggyReport.tests.length, 56);
  assert.equal(buggyReport.testIdentitySha256, fixedReport.testIdentitySha256);
  assert.deepEqual(buggyReport.failures, [40]);
  assert.deepEqual(fixedReport.failures, []);
  const skip = verify('fixed', fixture('fixed', { skip: 3 }), 'skip');
  assert.notEqual(skip.status, 0, 'SKIP must be rejected');
  const leak = verify('fixed', fixture('fixed', { extraLeak: true }), 'leak');
  assert.notEqual(leak.status, 0, 'unrelated leak must be rejected');
  const extra = verify('buggy', fixture('buggy', { extraFail: 41 }), 'extra-fail');
  assert.notEqual(extra.status, 0, 'second buggy failure must be rejected');
  const truncated = fixture('fixed');
  truncated.stdout = truncated.stdout.replace('ok 56 test 56\n', '');
  assert.notEqual(verify('fixed', truncated, 'truncated').status, 0);
  process.stdout.write('Gate B TAP contract regression: PASS\n');
} finally {
  const relative = path.relative(os.tmpdir(), temporary);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Refusing to remove temporary test directory outside system temp');
  }
  rmSync(temporary, { recursive: true, force: true });
}
