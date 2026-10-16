import { docker } from './docker.js';
import { z } from 'zod';
export async function cleanupOwnedResources(
  runId: string,
  containers: string[],
  network: string | undefined,
  invoke: typeof docker = docker,
): Promise<void> {
  const failures: string[] = [];
  for (const resource of [
    ...containers.map((name) => ({ name, network: false })),
    ...(network ? [{ name: network, network: true }] : []),
  ]) {
    try {
      const info = await invoke(
        resource.network ? ['network', 'inspect', resource.name] : ['inspect', resource.name],
        { allowFailure: true },
      );
      if (info.code !== 0) {
        if (/No such (?:object|container|network)|network .* not found/i.test(info.stderr))
          continue;
        throw new Error(info.stderr || 'Docker resource inspection failed');
      }
      const schema = resource.network
        ? z.object({ Labels: z.record(z.string(), z.string()) })
        : z.object({ Config: z.object({ Labels: z.record(z.string(), z.string()) }) });
      const raw: unknown = (JSON.parse(info.stdout) as unknown[])[0];
      const infoValue = schema.parse(raw);
      const labels = 'Config' in infoValue ? infoValue.Config.Labels : infoValue.Labels;
      if (labels['replaykit.run'] !== runId) throw new Error('Resource ownership mismatch');
      await invoke(
        resource.network ? ['network', 'rm', resource.name] : ['rm', '-f', resource.name],
      );
    } catch (error) {
      failures.push(`${resource.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(`Resource cleanup failed: ${failures.join('; ')}`);
}
