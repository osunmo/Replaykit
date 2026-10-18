import { expect, it } from 'vitest';
import { parseConcurrency, runBounded } from './concurrency.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function tasks() {
  const releases = new Map<number, (result: string) => void>();
  const started: number[] = [];
  const execute = (value: number) => {
    started.push(value);
    return new Promise<string>((resolve) => releases.set(value, resolve));
  };
  return { releases, started, execute };
}

it('defaults to three and rejects unbounded or malformed concurrency', () => {
  expect(parseConcurrency()).toBe(3);
  expect(parseConcurrency('1')).toBe(1);
  expect(parseConcurrency('3')).toBe(3);
  for (const invalid of ['0', '-1', '4', '10', '11', '3x', '1.5', 'Infinity', ''])
    expect(() => parseConcurrency(invalid)).toThrow();
});

it('cancellation stops dispatch and drains active tasks', async () => {
  const abort = new AbortController();
  const { releases, started, execute } = tasks();
  const pending = runBounded([0, 1, 2, 3], 2, execute, undefined, abort.signal);
  abort.abort();
  releases.get(0)!('zero');
  releases.get(1)!('one');
  expect(await pending).toEqual(['zero', 'one']);
  expect(started).toEqual([0, 1]);
});

it('refills a freed slot without waiting for the rest of a batch and preserves order', async () => {
  const { releases, started, execute } = tasks();
  const pending = runBounded([0, 1, 2, 3, 4], 3, execute);
  expect(started).toEqual([0, 1, 2]);
  releases.get(1)!('one');
  await tick();
  expect(started).toEqual([0, 1, 2, 3]);
  releases.get(3)!('three');
  await tick();
  expect(started).toEqual([0, 1, 2, 3, 4]);
  releases.get(4)!('four');
  releases.get(2)!('two');
  releases.get(0)!('zero');
  expect(await pending).toEqual(['zero', 'one', 'two', 'three', 'four']);
});

it('stops dispatching after an infrastructure result and awaits all active executions', async () => {
  const { releases, started, execute } = tasks();
  let settled = false;
  const pending = runBounded([0, 1, 2, 3], 3, execute, (value) => value === 'ERROR').then(
    (result) => {
      settled = true;
      return result;
    },
  );
  releases.get(1)!('ERROR');
  await tick();
  expect(started).toEqual([0, 1, 2]);
  expect(settled).toBe(false);
  releases.get(0)!('cleaned');
  releases.get(2)!('cleaned');
  expect(await pending).toEqual(['cleaned', 'ERROR', 'cleaned']);
});

it('drains other workers before propagating a thrown failure', async () => {
  let release!: () => void;
  let cleaned = false;
  const pending = runBounded([0, 1, 2], 2, async (value) => {
    if (value === 0) throw new Error('disk write failed');
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    cleaned = true;
    return value;
  });
  const assertion = expect(pending).rejects.toThrow('disk write failed');
  await tick();
  expect(cleaned).toBe(false);
  release();
  await assertion;
  expect(cleaned).toBe(true);
});
