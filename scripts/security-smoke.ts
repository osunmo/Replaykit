import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { newOutput } from '../packages/cli/src/workflow.js';
import { runSandbox } from '../packages/judge/src/sandbox.js';
import { relativeArtifactPath } from '../packages/cli/src/publication.js';

// These adversarial probes are source strings executed ONLY inside the candidate container.
const root = process.cwd();
const output = await newOutput(root);
const request = { orderId: 'security-order', idempotencyKey: 'security-key', amount: 100 };
const probes = [
  {
    name: 'filesystem-secrets-and-egress',
    timeout: 10000,
    source: `import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
await assert.rejects(readFile('/app/benchmark/private/R1/reference.ts'));
await assert.rejects(readFile('/var/run/docker.sock'));
await assert.rejects(readFile('/candidate/../../AGENTS.md'));
await assert.rejects(writeFile('/candidate/escape.txt', 'escape'));
await assert.rejects(writeFile('/etc/replaykit-escape', 'escape'));
assert.equal((await readFile('/proc/1/environ', 'utf8')).includes('DATABASE_URL'), false);
await assert.rejects(fetch('http://1.1.1.1', { signal: AbortSignal.timeout(1500) }));
await assert.rejects(fetch('http://host.docker.internal:55432', { signal: AbortSignal.timeout(1500) }));
`,
    expected: 'COMPLETED',
  },
  {
    name: 'arbitrary-broker-command',
    timeout: 5000,
    source: [
      "process.stdout.write('@replaykit/request:' + JSON.stringify({ id: 1, action: 'exec', command: 'cat /etc/passwd' }) + String.fromCharCode(10));",
      `process.stdout.write('@replaykit/request:' + JSON.stringify({ id: 2, action: 'pay', input: ${JSON.stringify(request)} }) + String.fromCharCode(10));`,
      `process.stdout.write('@replaykit/request:' + JSON.stringify({ id: 3, action: 'pay', input: ${JSON.stringify(request)} }) + String.fromCharCode(10));`,
      'setInterval(() => {}, 1000);',
    ].join('\n'),
    expected: 'CANDIDATE_PROTOCOL_REJECTED',
  },
  {
    name: 'infinite-loop',
    timeout: 1500,
    source: 'while (true) {}\n',
    expected: 'CANDIDATE_TIMEOUT',
  },
  {
    name: 'memory-limit',
    timeout: 10000,
    source: 'const blocks = []; for (;;) blocks.push(Buffer.alloc(16 * 1024 * 1024, 1));\n',
    expected: 'CANDIDATE_OOM',
  },
];
const results = [];
for (const probe of probes) {
  process.stderr.write(`Security probe: ${probe.name}\n`);
  const evidence = await runSandbox(root, output, 'buggy', probe.source, request, {
    candidateTimeoutMs: probe.timeout,
  });
  const passed =
    probe.expected === 'COMPLETED'
      ? evidence.executionStatus === 'COMPLETED' &&
        evidence.exitCode === 0 &&
        evidence.requests === 0 &&
        evidence.charges === 0
      : probe.expected === 'ERROR'
        ? evidence.executionStatus === 'ERROR' && evidence.requests === 0
        : evidence.executionStatus === 'ERROR' &&
          evidence.error?.includes(probe.expected) === true &&
          (probe.name !== 'arbitrary-broker-command' || evidence.charges === 0);
  results.push({
    name: probe.name,
    status: passed ? 'PASS' : 'FAIL',
    expected: probe.expected,
    executionStatus: evidence.executionStatus,
    error: evidence.error,
    evidence: `executions/${evidence.runId}/evidence.json`,
  });
}
const summary = {
  status: results.every((result) => result.status === 'PASS') ? 'PASS' : 'FAIL',
  probes: results,
};
await writeFile(path.join(output, 'security.json'), JSON.stringify(summary, null, 2) + '\n');
process.stdout.write(
  JSON.stringify({ ...summary, output: relativeArtifactPath(root, output) }, null, 2) + '\n',
);
if (summary.status !== 'PASS') process.exitCode = 1;
