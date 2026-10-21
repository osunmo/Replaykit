import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const allowed = [
  'queueMicrotask',
  'structuredClone',
  'atob',
  'btoa',
  'performance',
  'fetch',
  'navigator',
  'crypto',
];
function fail(message) {
  throw new Error('Gate B TAP contract: ' + message);
}
function oneMatch(lines, expression, label) {
  const matches = lines.map((line) => expression.exec(line)).filter(Boolean);
  if (matches.length !== 1) fail(`expected exactly one ${label}, found ${matches.length}`);
  return matches[0];
}
function parseMarker(lines, prefix) {
  const matches = lines.filter((line) => line.startsWith(prefix));
  if (matches.length !== 1) fail(`expected exactly one ${prefix} marker`);
  try {
    return JSON.parse(matches[0].slice(prefix.length));
  } catch {
    fail(`malformed ${prefix} marker`);
  }
}

try {
  const [role, stdoutPath, stderrPath] = process.argv.slice(2);
  if (
    !['buggy', 'fixed'].includes(role) ||
    !stdoutPath ||
    !stderrPath ||
    process.argv.length !== 5
  ) {
    fail('usage: node verify-gate-b-tap.mjs buggy|fixed official.stdout official.stderr');
  }
  const stdout = readFileSync(stdoutPath, 'utf8');
  const stderr = readFileSync(stderrPath, 'utf8');
  const lines = stdout.split(/\r?\n/);
  const errLines = stderr.split(/\r?\n/);
  const plan = oneMatch(lines, /^1\.\.(\d+)$/, 'plan');
  if (Number(plan[1]) !== 56) fail('official plan is not 56');
  const tests = [];
  for (const line of lines) {
    const match = /^(not ok|ok) ([1-9]\d*) (.+)$/.exec(line);
    if (match) {
      const id = Number(match[2]);
      const title = match[3];
      if (/^(SKIP|TODO)\b/.test(title)) fail(`test ${id} skipped or TODO`);
      tests.push({ id, title, status: match[1] === 'ok' ? 'pass' : 'fail' });
    }
  }
  if (tests.length !== 56) fail(`expected 56 result lines, got ${tests.length}`);
  tests.sort((a, b) => a.id - b.id);
  for (let i = 0; i < 56; i++) {
    if (tests[i].id !== i + 1) fail(`missing or duplicate test ID ${i + 1}`);
  }
  const failures = tests.filter((test) => test.status === 'fail').map((test) => test.id);
  const expectedFailures = role === 'buggy' ? [40] : [];
  if (JSON.stringify(failures) !== JSON.stringify(expectedFailures)) {
    fail(`unexpected per-test failures: ${JSON.stringify(failures)}`);
  }
  if (tests[39].title !== 'parse parses plain objects correctly') {
    fail('official regression test 40 identity mismatch');
  }
  const expectedCounts = {
    tests: 56,
    pass: role === 'buggy' ? 55 : 56,
    fail: role === 'buggy' ? 1 : 0,
    skipped: 0,
    todo: 0,
  };
  for (const [key, expected] of Object.entries(expectedCounts)) {
    const match = oneMatch(lines, new RegExp(`^# ${key} (\\d+)$`), `${key} footer`);
    if (Number(match[1]) !== expected) fail(`${key} footer expected ${expected}, got ${match[1]}`);
  }
  if (
    role === 'buggy' &&
    (!stdout.includes('TypeError: source.hasOwnProperty is not a function') ||
      !/at exports\.clone \(\/case\/lib\/utils\.js:47:20\)/.test(stdout))
  ) {
    fail('buggy official native TypeError or qs production frame missing');
  }
  const adaptation = parseMarker(errLines, 'gate-b-lab-adaptation:');
  if (
    adaptation.schemaVersion !== 1 ||
    adaptation.mode !== 'exact-eight-unchanged-node-globals' ||
    JSON.stringify(adaptation.allowed) !== JSON.stringify(allowed)
  ) {
    fail('predeclared Lab adaptation marker mismatch');
  }
  const leakResult = parseMarker(errLines, 'gate-b-lab-leaks:');
  if (!Array.isArray(leakResult.remaining) || leakResult.remaining.length !== 0) {
    fail('unexpected or changed global leaked');
  }
  const identity = tests.map(({ id, title }) => ({ id, title }));
  const testIdentitySha256 = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  process.stdout.write(
    JSON.stringify({
      schemaVersion: 1,
      role,
      plan: 56,
      counts: expectedCounts,
      failures,
      testIdentitySha256,
      tests,
    }) + '\n',
  );
} catch (error) {
  process.stderr.write(String(error.message) + '\n');
  process.exitCode = 1;
}
