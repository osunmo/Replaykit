import { expect, it } from 'vitest';
import { cleanupOwnedResources } from './cleanup.js';
import type { docker } from './docker.js';
it('cleans a partially created container and leaves unrelated resources alone', async () => {
  const resources = new Map([
    ['failed-start', 'this-run'],
    ['unrelated', 'other-run'],
  ]);
  const invoke: typeof docker = async (args) => {
    const name = args.at(-1)!;
    if (args[0] === 'inspect') {
      if (!resources.has(name))
        return { code: 1, stdout: '', stderr: 'Error: No such object: ' + name };
      return {
        code: 0,
        stdout: JSON.stringify([{ Config: { Labels: { 'replaykit.run': resources.get(name) } } }]),
        stderr: '',
      };
    }
    if (args[0] === 'rm') resources.delete(name);
    return { code: 0, stdout: '', stderr: '' };
  };
  await cleanupOwnedResources('this-run', ['failed-start', 'not-created'], undefined, invoke);
  expect([...resources.keys()]).toEqual(['unrelated']);
  await expect(cleanupOwnedResources('this-run', ['unrelated'], undefined, invoke)).rejects.toThrow(
    'ownership',
  );
  expect(resources.has('unrelated')).toBe(true);
});
