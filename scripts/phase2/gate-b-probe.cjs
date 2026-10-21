'use strict';

const assert = require('node:assert/strict');
const Qs = require('./');
const expected = '{"a":{"b":"c"}}';

console.log(
  JSON.stringify({ event: 'module', path: require.resolve('./'), node: process.version }),
);
const control = Qs.parse('a[b]=c');
assert.strictEqual(JSON.stringify(control), expected);
console.log(JSON.stringify({ event: 'control', passed: true, output: control }));

const a = Object.create(null);
a.b = 'c';
try {
  const output = Qs.parse({ a: a });
  console.log(JSON.stringify({ event: 'issue33-output', output: output }));
  assert.strictEqual(JSON.stringify(output), expected);
  console.log(JSON.stringify({ event: 'issue33-assertion', passed: true }));
} catch (error) {
  process.stderr.write(String(error.stack) + '\n');
  console.log(
    JSON.stringify({
      event: 'issue33-error',
      name: error.name,
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
      ownProperties: Object.getOwnPropertyNames(error).map((key) => [key, error[key]]),
    }),
  );
  process.exitCode = 1;
}
