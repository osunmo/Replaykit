import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

interface BrokerRequest {
  id: number;
  action: string;
  input?: unknown;
  orderId?: string;
}

function harness(
  body: string,
  respond: (request: BrokerRequest, child: ChildProcessWithoutNullStreams) => void,
): Promise<{ code: number | null; stdout: string; stderr: string; requests: BrokerRequest[] }> {
  const fixture = pathToFileURL(resolve('docker/replay-fixture.mjs')).href;
  // These snippets are repository-authored protocol tests, never planner-generated candidates.
  const source = `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { payment, chargeCount } from ${JSON.stringify(fixture)};
test('trusted SDK protocol harness', async (context) => { ${body} });`;
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
      shell: false,
      windowsHide: true,
      stdio: 'pipe',
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    });
    const requests: BrokerRequest[] = [];
    let stdout = '';
    let stderr = '';
    let buffer = '';
    const deadline = setTimeout(() => {
      child.kill();
      reject(new Error(`Protocol harness did not exit: ${stdout}\n${stderr}`));
    }, 5_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('@replaykit/request:')) continue;
        const request = JSON.parse(line.slice('@replaykit/request:'.length)) as BrokerRequest;
        requests.push(request);
        respond(request, child);
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(deadline);
      resolveResult({ code, stdout, stderr, requests });
    });
  });
}

function reply(child: ChildProcessWithoutNullStreams, value: unknown): void {
  child.stdin.write(`${JSON.stringify(value)}\n`);
}

describe('candidate stdin/stdout SDK', () => {
  it('correlates out-of-order replies and returns payment bodies even for HTTP 409', async () => {
    let first: BrokerRequest | undefined;
    const result = await harness(
      `
      const paymentResult = payment({ orderId: 'order-1', idempotencyKey: 'same-key', amount: 100 });
      const countResult = chargeCount('order-1');
      assert.equal(await countResult, 2);
      assert.deepEqual(await paymentResult, { error: 'DuplicatePaymentError', chargeCount: 2 });
    `,
      (request, child) => {
        if (request.action === 'pay') first = request;
        else {
          reply(child, {
            id: request.id,
            ok: true,
            value: { status: 200, body: { chargeCount: 2 } },
          });
          reply(child, {
            id: first?.id,
            ok: true,
            value: { status: 409, body: { error: 'DuplicatePaymentError', chargeCount: 2 } },
          });
        }
      },
    );
    assert.equal(result.code, 0, result.stderr + result.stdout);
    assert.deepEqual(result.requests, [
      {
        id: 1,
        action: 'pay',
        input: { orderId: 'order-1', idempotencyKey: 'same-key', amount: 100 },
      },
      { id: 2, action: 'charges', orderId: 'order-1' },
    ]);
  });

  it('rejects broker errors and exits after its last request settles', async () => {
    const result = await harness(
      `
      await assert.rejects(payment({}), /denied/);
    `,
      (request, child) => reply(child, { id: request.id, ok: false, error: 'denied' }),
    );
    assert.equal(result.code, 0, result.stderr + result.stdout);
  });

  it('allows twenty requests and rejects the next without emitting another request', async () => {
    const result = await harness(
      `
      for (let index = 0; index < 20; index++) assert.equal(await chargeCount('order-1'), 1);
      await assert.rejects(chargeCount('order-1'), /limit.*20|20.*limit/i);
    `,
      (request, child) =>
        reply(child, {
          id: request.id,
          ok: true,
          value: { status: 200, body: { chargeCount: 1 } },
        }),
    );
    assert.equal(result.code, 0, result.stderr + result.stdout);
    assert.deepEqual(
      result.requests.map((request) => request.id),
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  it('rejects pending requests when the broker input closes', async () => {
    const result = await harness(
      `
      await assert.rejects(chargeCount('order-1'), /closed/i);
    `,
      (_request, child) => child.stdin.end(),
    );
    assert.equal(result.code, 0, result.stderr + result.stdout);
  });

  it('rejects malformed protocol replies', async () => {
    const result = await harness(
      `
      await assert.rejects(chargeCount('order-1'), /invalid|malformed/i);
    `,
      (_request, child) => child.stdin.write('not-json\n'),
    );
    assert.equal(result.code, 0, result.stderr + result.stdout);
  });

  it('times out after ten seconds and clears pending work without sleeping', async () => {
    const result = await harness(
      `
      context.mock.timers.enable({ apis: ['setTimeout'] });
      const result = assert.rejects(chargeCount('order-1'), /timeout.*10000|10000.*timeout/i);
      context.mock.timers.tick(9999);
      context.mock.timers.tick(1);
      await result;
    `,
      () => {},
    );
    assert.equal(result.code, 0, result.stderr + result.stdout);
  });
});
