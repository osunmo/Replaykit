export function parseConcurrency(value: string = '3'): number {
  if (!/^\d+$/.test(value)) throw new Error('Concurrency must be an integer from 1 to 10');
  const concurrency = Number(value);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 10)
    throw new Error('Concurrency must be an integer from 1 to 10');
  return concurrency;
}

/** A failed worker stops new work; every active worker drains before return or rejection. */
export async function runBounded<T, R>(
  items: readonly T[],
  concurrency: number,
  execute: (item: T, index: number) => Promise<R>,
  shouldStop: (result: R) => boolean = () => false,
): Promise<R[]> {
  parseConcurrency(String(concurrency));
  let cursor = 0;
  let stopped = false;
  let failure: unknown;
  let failed = false;
  const results = new Map<number, R>();
  const worker = async () => {
    while (!stopped && cursor < items.length) {
      const index = cursor++;
      try {
        const result = await execute(items[index]!, index);
        results.set(index, result);
        if (shouldStop(result)) stopped = true;
      } catch (error) {
        if (!failed) failure = error;
        failed = true;
        stopped = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failed) throw failure;
  return [...results.entries()].sort(([a], [b]) => a - b).map(([, value]) => value);
}
