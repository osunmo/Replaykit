import { describe, expect, it } from 'vitest';
import type { ProductionIncidentContext } from '../../contracts/src/incident-context.js';
import {
  extractJavaScriptCode,
  generateRegressionTest,
  levenshteinDistance,
  UPSTREAM_TEST_40_CANONICAL,
  validateTestAst,
} from './ai-generator.js';
import { parseTapOutput } from './blind-evaluator.js';
import {
  auditWorkspaceBlinding,
  scrubTest40FromParseJs,
} from './sanitizer.js';

describe('Blind AI Synthesis Unit Tests', () => {
  describe('Sanitizer & Blinding Audit', () => {
    it('scrubs test 40 cleanly from test/parse.js source', () => {
      const mockParseJs = `
describe('#parse', function () {
    it('test 1', function (done) {
        done();
    });

    it('parses plain objects correctly', function (done) {
        var a = Object.create(null);
        a.b = 'c';
        expect(Qs.parse({ a: a })).to.deep.equal({ a: { b: 'c' } });
        done();
    });
});
`;
      const scrubbed = scrubTest40FromParseJs(mockParseJs);
      expect(scrubbed).not.toContain('parses plain objects correctly');
      expect(scrubbed).toContain("it('test 1'");
      expect(scrubbed).toContain('});');
    });

    it('rejects test 40 if not found during scrubbing', () => {
      const invalidSource = 'describe("#parse", function () {});';
      expect(() => scrubTest40FromParseJs(invalidSource)).toThrow('FAILED_TO_LOCATE_TEST_40_IN_PARSE_JS');
    });
  });

  describe('AI Generator & AST Safety', () => {
    it('extracts JavaScript code from markdown fences', () => {
      const fenced = 'Here is the test:\n```javascript\nvar Lab = require("lab");\n```\nDone!';
      expect(extractJavaScriptCode(fenced)).toBe('var Lab = require("lab");');
    });

    it('calculates Levenshtein distance correctly', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(levenshteinDistance('abc', 'abc')).toBe(0);
    });

    it('validates safe test AST', () => {
      const safeCode = `
var Lab = require('lab');
var Qs = require('../');
var expect = Lab.expect;
var describe = Lab.experiment;
var it = Lab.test;

describe('#parse', function () {
    it('reproduces prototype issue', function (done) {
        var obj = Object.create(null);
        obj.b = 'c';
        expect(Qs.parse({ a: obj })).to.deep.equal({ a: { b: 'c' } });
        done();
    });
});
`;
      const result = validateTestAst(safeCode);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects banned process and network APIs', () => {
      const dangerousCode = `
var fetch = require('node-fetch');
setTimeout(function() {
    process.exit(1);
}, 1000);
`;
      const result = validateTestAst(dangerousCode);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('fetch'))).toBe(true);
      expect(result.errors.some((e) => e.includes('setTimeout'))).toBe(true);
    });

    it('rejects unauthorized module requires (e.g. child_process, fs, net)', () => {
      const codeChildProcess = `var cp = require('child_process'); cp.execSync('ls');`;
      const resCp = validateTestAst(codeChildProcess);
      expect(resCp.valid).toBe(false);
      expect(resCp.errors.some((e) => e.includes('child_process'))).toBe(true);

      const codeFs = `var fs = require('fs'); fs.readFileSync('/etc/passwd');`;
      const resFs = validateTestAst(codeFs);
      expect(resFs.valid).toBe(false);
      expect(resFs.errors.some((e) => e.includes('fs'))).toBe(true);

      const codeDynamic = `var m = 'fs'; var f = require(m);`;
      const resDyn = validateTestAst(codeDynamic);
      expect(resDyn.valid).toBe(false);
      expect(resDyn.errors.some((e) => e.includes('Dynamic require'))).toBe(true);
    });

    it('rejects dangerous globals and process termination methods', () => {
      const codeEval = `eval('console.log(1)');`;
      const resEval = validateTestAst(codeEval);
      expect(resEval.valid).toBe(false);
      expect(resEval.errors.some((e) => e.includes('eval'))).toBe(true);

      const codeKill = `process.kill(1234);`;
      const resKill = validateTestAst(codeKill);
      expect(resKill.valid).toBe(false);
      expect(resKill.errors.some((e) => e.includes('process.kill'))).toBe(true);
    });

    it('immediately yields INSUFFICIENT_ORACLE when incident oracle is insufficient', async () => {
      const insufficientIncident: ProductionIncidentContext = {
        schemaVersion: 'incident-context-v1',
        incidentId: '00000000-0000-0000-0000-000000000001',
        createdAt: '2026-10-20T00:00:00Z',
        sourceRevision: {
          gitSha: '360e2b0b48548b9bfdb71f8c82a68c4f34ec0725',
          repository: 'https://github.com/hapijs/qs.git',
        },
        error: {
          type: 'TypeError',
          value: 'source.hasOwnProperty is not a function',
          topApplicationFrame: 'at exports.clone (/case/lib/utils.js:47:20)',
          frames: [
            {
              filename: '/case/lib/utils.js',
              function: 'exports.clone',
              lineno: 47,
              colno: 20,
              inApp: true,
            },
          ],
          handled: false,
        },
        request: null,
        breadcrumbs: [],
        runtime: {
          nodeVersion: 'v22.23.3',
          os: 'linux',
          arch: 'x64',
          environmentVariables: {},
        },
        oracle: {
          sourceType: 'inferred',
          confidence: 'ambiguous',
          expectedOutcome: {
            shouldThrow: false,
          },
        },
        sufficiency: {
          status: 'INSUFFICIENT_ORACLE',
          missingFields: ['oracle.specification'],
          blockingReason: 'Expected behavior is unspecified.',
        },
      };

      const result = await generateRegressionTest(insufficientIncident, '/tmp');
      expect(result.status).toBe('INSUFFICIENT_ORACLE');
      expect(result.testSource).toBeNull();
      expect(result.reason).toBe('Expected behavior is unspecified.');
    });
  });

  describe('TAP Parser', () => {
    it('parses passing TAP output', () => {
      const stdout = `
1..2
ok 1 #parse test one
ok 2 #parse test two
# tests 2
# pass 2
# fail 0
`;
      const res = parseTapOutput(stdout, '');
      expect(res.total).toBe(2);
      expect(res.passed).toBe(2);
      expect(res.failed).toBe(0);
    });

    it('parses failing TAP output with failure identity', () => {
      const stdout = `
1..2
ok 1 #parse test one
not ok 2 #parse test two
  TypeError: source.hasOwnProperty is not a function
    at exports.clone (/case/lib/utils.js:47:20)
# tests 2
# pass 1
# fail 1
`;
      const res = parseTapOutput(stdout, '');
      expect(res.total).toBe(2);
      expect(res.passed).toBe(1);
      expect(res.failed).toBe(1);
      expect(res.tests[1]?.failure?.type).toBe('TypeError');
      expect(res.tests[1]?.failure?.topApplicationFrame).toBe('at exports.clone (/case/lib/utils.js:47:20)');
    });
  });

  describe('AI Test Validator & Correctness Protections', () => {
    it('detects and rejects swallowed promise rejections that only log errors', () => {
      const swallowedRejectionCode = `
const Fastify = require('fastify');
const assert = require('assert');
const fastify = Fastify();
fastify.inject({ method: 'GET', url: '/test' }).then(res => {
  assert.strictEqual(res.statusCode, 200);
}).catch(err => {
  console.error('Test failed:', err);
});
`;
      const result = validateTestAst(swallowedRejectionCode);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Swallowed promise rejection detected')),
      ).toBe(true);
    });

    it('detects and rejects tests with missing assertions', () => {
      const codeWithoutAssertions = `
const Fastify = require('fastify');
const fastify = Fastify();
fastify.get('/test', (req, res) => res.send('ok'));
console.log('test executed without any assertions');
`;
      const result = validateTestAst(codeWithoutAssertions);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Missing test assertions')),
      ).toBe(true);
    });

    it('detects and rejects swallowed assertions inside try/catch blocks', () => {
      const swallowedAssertionCode = `
const assert = require('assert');
try {
  assert.strictEqual(1, 2);
} catch (e) {
  console.log('Swallowed assertion error:', e.message);
}
`;
      const result = validateTestAst(swallowedAssertionCode);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Swallowed assertion detected')),
      ).toBe(true);
    });

    it('detects and rejects dangling unawaited async operations in scripts', () => {
      const danglingAsyncCode = `
const Fastify = require('fastify');
const assert = require('assert');
const fastify = Fastify();
assert.ok(fastify);
fastify.inject({ method: 'GET', url: '/test' });
`;
      const result = validateTestAst(danglingAsyncCode);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Dangling async operation detected')),
      ).toBe(true);
    });

    it('detects and rejects process.exit(0) used to mask test outcomes', () => {
      const maskSuccessCode = `
const assert = require('assert');
assert.strictEqual(1, 1);
process.exit(0);
`;
      const result = validateTestAst(maskSuccessCode, 'repro.test.js', undefined, {
        allowProcessExit: true,
      });
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('process.exit(0) cannot be used')),
      ).toBe(true);
    });

    it('accepts properly hardened asynchronous regression tests', () => {
      const hardenedCode = `
const Fastify = require('fastify');
const assert = require('assert');

async function main() {
  const fastify = Fastify();
  try {
    const res = await fastify.inject({ method: 'GET', url: '/test' });
    assert.strictEqual(res.statusCode, 404);
  } finally {
    await fastify.close();
  }
}

main().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
`;
      const result = validateTestAst(hardenedCode, 'repro.test.js', undefined, {
        allowProcessExit: true,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates the official Fastify #4807 hardened regression test fixture', async () => {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const fixturePath = path.join(
        __dirname,
        'fixtures',
        'fastify4807',
        'hardened-repro.test.js',
      );
      const fixtureSource = await fs.readFile(fixturePath, 'utf8');
      const result = validateTestAst(
        fixtureSource,
        'hardened-repro.test.js',
        undefined,
        {
          allowTimers: true,
          allowProcessExit: true,
        },
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
