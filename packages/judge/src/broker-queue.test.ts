import { expect, it } from 'vitest';
import { BrokerQueue } from './broker-queue.js';

it('does not execute requests queued after the first invalid request', async () => {
  const dispatched: string[] = [];
  const queue = new BrokerQueue(() => {});
  queue.enqueue(async () => {
    throw new Error('invalid request');
  });
  queue.enqueue(async () => {
    dispatched.push('payment');
  });
  await expect(queue.drain()).rejects.toThrow('invalid request');
  expect(dispatched).toEqual([]);
});

it('awaits an in-flight broker command after timeout and prevents later dispatch', async () => {
  let release!: () => void;
  let finished = false;
  let later = false;
  const queue = new BrokerQueue(() => {});
  queue.enqueue(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    finished = true;
  });
  queue.enqueue(async () => {
    later = true;
  });
  await Promise.resolve();
  queue.abort(new Error('timeout'));
  let settled = false;
  const pending = queue.drain().catch((error: Error) => {
    settled = true;
    return error;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  expect((await pending)?.message).toBe('timeout');
  expect(finished).toBe(true);
  expect(later).toBe(false);
});
