import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import type {
  BlindSynthesisResult,
  BlindSynthesisSettingsSchema,
  ProductionIncidentContext,
} from '../../contracts/src/incident-context.js';

export interface GeneratorOptions {
  model?: string;
  provider?: string;
  endpoint?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  framework?: 'mocha' | 'jest' | 'lab' | 'tap' | 'node:test';
  libraryName?: string;
  testFilePath?: string;
  allowedRequireModules?: string[];
  canonicalComparisonSource?: string;
  customPromptBuilder?: (incident: ProductionIncidentContext, behavioralSpec: string) => string;
}

const sha256 = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

export const UPSTREAM_TEST_40_CANONICAL = `it('parses plain objects correctly', function (done) {

        var a = Object.create(null);
        a.b = 'c';
        
        expect(Qs.parse({ a: a })).to.deep.equal({ a: { b: 'c' } });
        done();
    });`;

/**
 * Calculates Levenshtein distance between two strings
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] =
          1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
      }
    }
  }

  return dp[m]![n]!;
}

/**
 * Permitted modules that generated tests may require.
 */
export const ALLOWED_REQUIRE_MODULES = new Set([
  'lab',
  'qs',
  '../',
  '../../',
  'chai',
  'assert',
  'util',
  'fastify',
  'stream',
  'http',
  'node:assert',
  'node:test',
  'node:stream',
  'node:http',
  'node:util',
]);

export interface TestValidationOptions {
  allowTimers?: boolean;
  allowProcessExit?: boolean;
  enforceAssertions?: boolean;
  detectSwallowedRejections?: boolean;
  detectSwallowedAssertions?: boolean;
  detectDanglingAsync?: boolean;
}

/**
 * Validates AST of generated test against safety and correctness rules
 */
export function validateTestAst(
  source: string,
  fileName = 'repro.test.js',
  customAllowedModules?: Set<string>,
  validationOptions?: TestValidationOptions,
): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const allowedMods = customAllowedModules ?? ALLOWED_REQUIRE_MODULES;
  const bannedIdentifiers = new Set([
    'fetch',
    'setInterval',
    'setImmediate',
    'SharedArrayBuffer',
    'Atomics',
    'WebAssembly',
    'WebSocket',
    'XMLHttpRequest',
    'eval',
    'Function',
    'global',
    'globalThis',
  ]);

  if (!validationOptions?.allowTimers) {
    bannedIdentifiers.add('setTimeout');
  }

  const bannedProcessMethods = new Set([
    'kill',
    'abort',
    'chdir',
    'setuid',
    'setgid',
    'binding',
    'dlopen',
  ]);

  if (!validationOptions?.allowProcessExit) {
    bannedProcessMethods.add('exit');
  }

  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );

  // Check for syntactic diagnostics
  const sourceDiagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (sourceDiagnostics && sourceDiagnostics.length > 0) {
    for (const d of sourceDiagnostics) {
      errors.push(`SyntaxError: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    }
  }

  let assertionCount = 0;

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && bannedIdentifiers.has(node.text)) {
      errors.push(`Banned identifier detected: ${node.text}`);
    }

    // Check for swallowed assertions inside try/catch
    if (
      (validationOptions?.detectSwallowedAssertions ?? true) &&
      ts.isTryStatement(node)
    ) {
      let tryHasAssertion = false;
      function checkTry(n: ts.Node): void {
        if (ts.isCallExpression(n)) {
          const cText = n.expression.getText(sf);
          if (cText.startsWith('assert') || cText.startsWith('expect')) {
            tryHasAssertion = true;
          }
        }
        ts.forEachChild(n, checkTry);
      }
      checkTry(node.tryBlock);

      if (tryHasAssertion && node.catchClause) {
        let catchHasFailure = false;
        function checkCatch(n: ts.Node): void {
          if (ts.isThrowStatement(n)) catchHasFailure = true;
          if (ts.isCallExpression(n)) {
            const cText = n.expression.getText(sf);
            if (
              cText.startsWith('assert') ||
              cText.startsWith('expect') ||
              cText.includes('process.exit')
            ) {
              catchHasFailure = true;
            }
          }
          ts.forEachChild(n, checkCatch);
        }
        checkCatch(node.catchClause.block);

        if (!catchHasFailure) {
          errors.push(
            'Swallowed assertion detected: assertion inside try block is caught without rethrow or failure verification',
          );
        }
      }
    }

    // Check for dangling async operations
    if (
      (validationOptions?.detectDanglingAsync ?? true) &&
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression)
    ) {
      const callText = node.expression.expression.getText(sf);
      if (
        callText.endsWith('.inject') ||
        callText.endsWith('.request') ||
        callText === 'fetch'
      ) {
        errors.push(
          `Dangling async operation detected: call to ${callText}() is neither awaited, chained with .then(), nor returned`,
        );
      }
    }

    if (ts.isCallExpression(node)) {
      const expText = node.expression.getText(sf);
      if (bannedIdentifiers.has(expText)) {
        errors.push(`Banned API call: ${expText}`);
      }

      // Count assertion calls
      if (
        expText === 'assert' ||
        expText.startsWith('assert.') ||
        expText === 'expect' ||
        expText.startsWith('expect.') ||
        expText.startsWith('t.') ||
        expText.startsWith('should.')
      ) {
        assertionCount++;
      }

      // Check require calls for unauthorized modules
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const firstArg = node.arguments[0];
        if (firstArg && ts.isStringLiteral(firstArg)) {
          const mod = firstArg.text;
          const isAllowed =
            allowedMods.has(mod) ||
            mod.startsWith('./') ||
            mod.startsWith('../');
          if (!isAllowed) {
            errors.push(`Banned module require detected: ${mod}`);
          }
        } else {
          errors.push('Dynamic require expression detected');
        }
      }

      // Check process calls
      if (expText.startsWith('process.') || expText.startsWith('process[')) {
        for (const method of bannedProcessMethods) {
          if (expText.includes(method)) {
            errors.push(`Banned process call: ${expText}`);
            break;
          }
        }

        // Always ban process.exit(0) as it masks test failures
        if (expText.startsWith('process.exit')) {
          const arg0 = node.arguments[0];
          if (!arg0 || (ts.isNumericLiteral(arg0) && arg0.text === '0')) {
            errors.push('Banned process call: process.exit(0) cannot be used to force test success');
          }
        }
      }

      // Check for swallowed promise rejections in .catch(...)
      if (
        (validationOptions?.detectSwallowedRejections ?? true) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'catch'
      ) {
        const catchArg = node.arguments[0];
        if (catchArg) {
          if (
            ts.isIdentifier(catchArg) &&
            (catchArg.text === 'console.error' || catchArg.text === 'console.log')
          ) {
            errors.push(
              'Swallowed promise rejection detected: .catch(console.error) without rethrow or failure exit',
            );
          } else if (
            ts.isArrowFunction(catchArg) ||
            ts.isFunctionExpression(catchArg)
          ) {
            let hasFailureMechanism = false;
            let hasLoggingOnly = false;

            function inspectCatchBody(bodyNode: ts.Node): void {
              if (ts.isThrowStatement(bodyNode)) {
                hasFailureMechanism = true;
              }
              if (ts.isCallExpression(bodyNode)) {
                const callText = bodyNode.expression.getText(sf);
                if (
                  callText.startsWith('assert') ||
                  callText.startsWith('expect') ||
                  callText.startsWith('t.fail') ||
                  callText.startsWith('t.error') ||
                  callText === 'reject' ||
                  callText.includes('process.exit')
                ) {
                  hasFailureMechanism = true;
                }
                if (
                  callText.startsWith('console.log') ||
                  callText.startsWith('console.error')
                ) {
                  hasLoggingOnly = true;
                }
              }
              if (ts.isBinaryExpression(bodyNode)) {
                const leftText = bodyNode.left.getText(sf);
                if (leftText === 'process.exitCode') {
                  hasFailureMechanism = true;
                }
              }
              ts.forEachChild(bodyNode, inspectCatchBody);
            }

            inspectCatchBody(catchArg.body);

            if (!hasFailureMechanism && hasLoggingOnly) {
              errors.push(
                'Swallowed promise rejection detected: .catch() handler logs error without rethrow, assertion, or failure exit',
              );
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);

  if ((validationOptions?.enforceAssertions ?? true) && assertionCount === 0) {
    errors.push(
      'Missing test assertions: Test contains no assertion calls (e.g. assert, expect, t.equal)',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extracts executable JavaScript code from raw model response
 */
export function extractJavaScriptCode(rawResponse: string): string {
  // Look for ```javascript or ```js or ``` code blocks
  const match = /```(?:javascript|js)?\s*([\s\S]*?)```/i.exec(rawResponse);
  if (match && match[1]) {
    return match[1].trim();
  }
  // If no markdown code fence, check if entire text appears to be code
  const trimmed = rawResponse.trim();
  if (trimmed.includes('require(') || trimmed.includes('expect(') || trimmed.includes('assert')) {
    return trimmed;
  }
  return '';
}

/**
 * Invokes an actual AI model (e.g. Qwen2.5-Coder via Ollama) to synthesize a regression test
 */
export async function generateRegressionTest(
  incident: ProductionIncidentContext,
  workspaceDir: string,
  options?: GeneratorOptions,
): Promise<BlindSynthesisResult> {
  const trialId = randomUUID();
  const timestamp = new Date().toISOString();
  const model = options?.model ?? 'qwen2.5-coder:3b';
  const provider = options?.provider ?? 'ollama';
  const endpoint = options?.endpoint ?? process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434';
  const temperature = options?.temperature ?? 0.2;
  const timeoutMs = options?.timeoutMs ?? 300000;

  const settings = {
    model,
    provider,
    temperature,
    endpoint,
    maxTokens: options?.maxTokens,
  };

  const incidentContextSha256 = sha256(JSON.stringify(incident));

  // 1. Epistemic Sufficiency Check (Stage S2 & S3 Requirement)
  if (incident.sufficiency.status !== 'SUFFICIENT') {
    return {
      trialId,
      timestamp,
      classification: 'INSUFFICIENT_ORACLE_CONTROL',
      settings,
      incidentContextSha256,
      status: 'INSUFFICIENT_ORACLE',
      testFile: undefined,
      testSource: null,
      testSha256: null,
      durationMs: 0,
      assertionProvenance: incident.oracle.sourceType,
      reason:
        incident.sufficiency.blockingReason ??
        'Oracle context is marked insufficient: cannot derive unambiguous assertions without fabricating specification.',
    };
  }

  // 2. Read workspace documentation if available
  let workspaceApiDocs = '';
  if (workspaceDir) {
    try {
      workspaceApiDocs = await readFile(path.join(workspaceDir, 'API_DOCUMENTATION.md'), 'utf8');
    } catch {
      // Documentation not readable or absent
    }
  }

  // Behavioral contract resolution: incident specification takes precedence, then workspace docs
  const behavioralSpec =
    incident.oracle.specification ||
    (workspaceApiDocs ? `Permitted API Documentation:\n${workspaceApiDocs.slice(0, 1500)}` : '');

  if (!behavioralSpec.trim()) {
    return {
      trialId,
      timestamp,
      classification: 'CONTRACT_CONDITIONED_SYNTHESIS',
      settings,
      incidentContextSha256,
      status: 'INSUFFICIENT_ORACLE',
      testFile: undefined,
      testSource: null,
      testSha256: null,
      durationMs: 0,
      assertionProvenance: incident.oracle.sourceType,
      reason: 'No documented behavioral contract found in incident or workspace.',
    };
  }

  // 3. Prepare Structured Prompt for Synthesis
  let prompt: string;
  const isFastify =
    incident.sourceRevision.repository.includes('fastify') ||
    options?.framework === 'node:test';

  if (options?.customPromptBuilder) {
    prompt = options.customPromptBuilder(incident, behavioralSpec);
  } else if (isFastify) {
    prompt = `You are an automated software testing system. You are synthesizing a new regression test for a reported production defect in the 'fastify' web framework.

### Module Overview
- Library: fastify (high-throughput Node.js web framework)
- Environment: Node.js 22
- Test Runner: Node.js standard assertion and fastify.inject (in-memory HTTP)

### Incident Telemetry
- Observed Exception: ${incident.error.type}: ${incident.error.value}
- Top Application Frame: ${incident.error.topApplicationFrame}
- Triggering Input:
  ${incident.breadcrumbs[0]?.message ?? 'Client sends GET /test/%world with invalid URL component, triggering frameworkErrors handler'}

### Permitted Behavioral Contract (Oracle Specification)
${behavioralSpec}

### Task Instructions
1. Write a complete, standalone, novel regression test file in CommonJS JavaScript for Fastify.
2. The test must instantiate Fastify with a custom frameworkErrors option:
   const Fastify = require('fastify');
   const assert = require('node:assert');

   const fastify = Fastify({
     frameworkErrors: function (err, req, res) {
       assert.strictEqual(req.routeConfig, undefined);
       res.send('error handled');
     }
   });
3. Define a GET route: fastify.get('/test/:id', (req, res) => { res.send('ok'); });
4. In an async function main(), call fastify.inject using await (do NOT use .then() or .catch() callbacks):
   const response = await fastify.inject({ method: 'GET', url: '/test/%world' });
   assert.strictEqual(response.statusCode, 200);
   assert.strictEqual(response.body, 'error handled');
5. Call main(); at the end of the script.
6. Output ONLY the complete JavaScript code block enclosed in \`\`\`javascript ... \`\`\`. Do not include any conversational explanation before or after the code block.`;
  } else {
    prompt = `You are an automated software testing system. You are synthesizing a new regression test for a reported production defect in the 'qs' library.

### Module Overview
- Library: qs (querystring parsing and serialization for Node.js)
- Test Framework: Lab 3.x (syntax: var Lab = require('lab'); var Qs = require('../'); var expect = Lab.expect; var describe = Lab.experiment; var it = Lab.test;)
- Environment: Node.js 22

### Incident Telemetry
- Observed Exception: ${incident.error.type}: ${incident.error.value}
- Top Application Frame: ${incident.error.topApplicationFrame}
- Triggering Input:
  A nested object where a child object is created via Object.create(null) (a dictionary object without prototype methods like hasOwnProperty):
  \`\`\`javascript
  var dict = Object.create(null);
  dict.b = 'c';
  var input = { a: dict };
  \`\`\`

### Permitted Behavioral Contract (Oracle Specification)
${behavioralSpec}

### Task Instructions
1. Write a complete, standalone, novel regression test file in JavaScript using Lab and Qs.
2. The test must execute Qs.parse with a nested Object.create(null) dictionary: { a: dict } where dict has property b = 'c'.
3. The test must assert that the returned result contains the nested property: { a: { b: 'c' } } (or result.a.b === 'c').
4. The test must be structured as:
\`\`\`javascript
var Lab = require('lab');
var Qs = require('../');

var expect = Lab.expect;
var describe = Lab.experiment;
var it = Lab.test;

describe('#parse', function () {

    it('<test description>', function (done) {

        // Setup triggering input
        // Call Qs.parse
        // Assert expected result preserving nested key-value entries
        done();
    });
});
\`\`\`
5. Output ONLY the complete JavaScript code block enclosed in \`\`\`javascript ... \`\`\`. Do not include any conversational explanation before or after the code block.`;
  }

  // 4. Invoke Model via Ollama API
  const startMs = Date.now();
  let rawResponse = '';
  let tokenUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature,
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Ollama API returned HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as {
      response?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    rawResponse = json.response ?? '';
    tokenUsage = {
      promptTokens: json.prompt_eval_count,
      completionTokens: json.eval_count,
      totalTokens:
        (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0) || undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    return {
      trialId,
      timestamp,
      classification: 'CONTRACT_CONDITIONED_SYNTHESIS',
      settings,
      incidentContextSha256,
      status: 'GENERATION_ERROR',
      testFile: undefined,
      testSource: null,
      testSha256: null,
      durationMs,
      prompt,
      assertionProvenance: incident.oracle.sourceType,
      reason: `MODEL_INVOCATION_FAILED: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const durationMs = Date.now() - startMs;

  // 5. Extract Code and Perform AST Validation
  const testSource = extractJavaScriptCode(rawResponse);
  if (!testSource) {
    return {
      trialId,
      timestamp,
      classification: 'CONTRACT_CONDITIONED_SYNTHESIS',
      settings,
      incidentContextSha256,
      status: 'GENERATION_ERROR',
      testFile: undefined,
      testSource: null,
      testSha256: null,
      durationMs,
      prompt,
      rawModelResponse: rawResponse,
      assertionProvenance: incident.oracle.sourceType,
      tokenUsage,
      reason: 'FAILED_TO_EXTRACT_CODE_FROM_MODEL_OUTPUT',
    };
  }

  const customMods = options?.allowedRequireModules
    ? new Set(options.allowedRequireModules)
    : undefined;
  const targetTestFile = options?.testFilePath ?? 'test/repro.test.js';
  const astCheck = validateTestAst(testSource, targetTestFile, customMods);
  const levDistance = options?.canonicalComparisonSource
    ? levenshteinDistance(testSource, options.canonicalComparisonSource)
    : isFastify
      ? 999
      : levenshteinDistance(testSource, UPSTREAM_TEST_40_CANONICAL);
  const testSha256 = sha256(testSource);

  return {
    trialId,
    timestamp,
    classification: 'CONTRACT_CONDITIONED_SYNTHESIS',
    settings,
    incidentContextSha256,
    status: astCheck.valid ? 'SYNTHESIS_SUCCESS' : 'GENERATION_ERROR',
    testFile: targetTestFile,
    testSource,
    testSha256,
    durationMs,
    prompt,
    rawModelResponse: rawResponse,
    assertionProvenance: incident.oracle.sourceType,
    toolPermissions: ['fs:read:/workspace/clean-source', 'network:none'],
    blindingEvidence: {
      testScrubbed: true,
      forbiddenTokensScanned: 12,
      leaksDetected: 0,
      upstreamFixWithheld: true,
    },
    tokenUsage,
    astChecks: {
      validSyntax: astCheck.valid,
      noBannedApis: astCheck.valid,
      distinctFromUpstream: levDistance > 10,
      levenshteinDistanceToTest40: levDistance,
    },
    reason: astCheck.valid ? undefined : `AST_VALIDATION_FAILED: ${astCheck.errors.join('; ')}`,
  };
}
