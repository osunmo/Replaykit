'use strict';

// Lab 3.0.0 predates these Node 22 built-ins and has no selective CLI ignore
// option. Its -l switch disables ALL leak detection, so keep the detector and
// suppress only these eight unchanged runtime-owned values.
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
const allowedSet = new Set(allowed);
const leaks = require('./node_modules/lab/lib/leaks');
const originalDetect = leaks.detect;
if (typeof originalDetect !== 'function') throw new Error('Lab leak detector missing');

const baseline = new Map(
  allowed.map((name) => {
    if (!Object.prototype.hasOwnProperty.call(globalThis, name)) {
      throw new Error('Expected Node global missing: ' + name);
    }
    return [
      name,
      {
        value: globalThis[name],
        descriptor: Object.getOwnPropertyDescriptor(globalThis, name),
      },
    ];
  }),
);

const initialLeaks = originalDetect();
if (
  !Array.isArray(initialLeaks) ||
  initialLeaks.length !== allowed.length ||
  initialLeaks.some((name) => !allowedSet.has(name)) ||
  new Set(initialLeaks).size !== allowed.length
) {
  throw new Error('Unexpected baseline Lab leak set under pinned Node image');
}

function unchanged(name) {
  if (!Object.prototype.hasOwnProperty.call(globalThis, name)) return false;
  const before = baseline.get(name);
  const now = Object.getOwnPropertyDescriptor(globalThis, name);
  return (
    Object.is(globalThis[name], before.value) &&
    now.configurable === before.descriptor.configurable &&
    now.enumerable === before.descriptor.enumerable &&
    now.writable === before.descriptor.writable &&
    now.get === before.descriptor.get &&
    now.set === before.descriptor.set
  );
}

leaks.detect = function detectWithNode22Allowance() {
  const result = originalDetect();
  if (!Array.isArray(result)) throw new Error('Lab leak detector returned unsupported result');
  const retained = result.filter((name) => !allowedSet.has(name) || !unchanged(name));
  for (const name of allowed) {
    if (!unchanged(name) && !retained.includes(name)) retained.push(name);
  }
  process.stderr.write('gate-b-lab-leaks:' + JSON.stringify({ remaining: retained }) + '\n');
  return retained;
};

process.stderr.write(
  'gate-b-lab-adaptation:' +
    JSON.stringify({
      schemaVersion: 1,
      mode: 'exact-eight-unchanged-node-globals',
      allowed,
    }) +
    '\n',
);
