import { describe, expect, it, vi } from 'vitest';
import {
  parseDockerLabels,
  isReplayKitResource,
  removeVolumeWithRetry,
  pruneReplayKitResources,
  InFlightResourceTracker,
  executeDockerWithRetry,
} from './docker-cleanup.js';
import type { docker } from '../../judge/src/docker.js';

describe('parseDockerLabels', () => {
  it('parses valid comma-delimited labels', () => {
    const raw = 'replaykit.run=123,replaykit.role=candidate,org.replaykit=true';
    const parsed = parseDockerLabels(raw);
    expect(parsed).toEqual({
      'replaykit.run': '123',
      'replaykit.role': 'candidate',
      'org.replaykit': 'true',
    });
  });

  it('handles empty or malformed inputs', () => {
    expect(parseDockerLabels('')).toEqual({});
    expect(parseDockerLabels(undefined)).toEqual({});
    expect(parseDockerLabels('flagOnly,key=value')).toEqual({
      flagOnly: '',
      key: 'value',
    });
  });
});

describe('isReplayKitResource', () => {
  it('identifies legitimate ReplayKit containers, volumes, and networks', () => {
    expect(
      isReplayKitResource('container', 'rk-ext-123-buggy-abc', { 'replaykit.run': '123' }),
    ).toBe(true);
    expect(
      isReplayKitResource('volume', 'rk-ext-123-buggy-abc-case', { 'replaykit.run': '123' }),
    ).toBe(true);
    expect(
      isReplayKitResource('container', 'rk-candidate-123', { 'replaykit.run': '123' }),
    ).toBe(true);
    expect(
      isReplayKitResource('container', 'rk-candidate-123', { 'replaykit.role': 'candidate' }),
    ).toBe(true);
    // Unlabeled containers must NEVER be pruned via broad name-prefix matching
    expect(
      isReplayKitResource('container', 'rk-candidate-123', {}),
    ).toBe(false);
    expect(
      isReplayKitResource('container', 'rk-custom-db', { 'my.app': 'production' }),
    ).toBe(false);
  });

  it('strictly rejects Docker Compose and dev database resources', () => {
    // Compose containers
    expect(
      isReplayKitResource(
        'container',
        'replaykit-postgres-1',
        { 'com.docker.compose.project': 'replaykit' },
      ),
    ).toBe(false);

    // Dev data volume
    expect(
      isReplayKitResource(
        'volume',
        'replaykit_replaykit-dev-data',
        { 'com.docker.compose.volume': 'replaykit-dev-data' },
      ),
    ).toBe(false);

    // Compose network
    expect(
      isReplayKitResource(
        'network',
        'replaykit_default',
        { 'com.docker.compose.network': 'default' },
      ),
    ).toBe(false);

    // Unrelated container
    expect(
      isReplayKitResource('container', 'my-nginx-app', {}),
    ).toBe(false);
  });

  it('respects targetRunId filter', () => {
    expect(
      isReplayKitResource('container', 'rk-run1', { 'replaykit.run': 'run1' }, 'run1'),
    ).toBe(true);
    expect(
      isReplayKitResource('container', 'rk-run2', { 'replaykit.run': 'run2' }, 'run1'),
    ).toBe(false);
  });
});

describe('removeVolumeWithRetry', () => {
  it('succeeds immediately on exit code 0', async () => {
    const invoke: typeof docker = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const res = await removeVolumeWithRetry('test-vol', 3, 10, invoke);
    expect(res.success).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('retries when volume is in use and succeeds on second attempt', async () => {
    let callCount = 0;
    const invoke: typeof docker = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { code: 1, stdout: '', stderr: 'Error: volume is in use by container 123' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const res = await removeVolumeWithRetry('test-vol', 3, 10, invoke);
    expect(res.success).toBe(true);
    expect(callCount).toBe(2);
  });

  it('treats missing volume as success', async () => {
    const invoke: typeof docker = vi.fn().mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Error: no such volume test-vol',
    });
    const res = await removeVolumeWithRetry('test-vol', 3, 10, invoke);
    expect(res.success).toBe(true);
  });

  it('fails cleanly when retries exhausted', async () => {
    const invoke: typeof docker = vi.fn().mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Error: volume is in use',
    });
    const res = await removeVolumeWithRetry('test-vol', 2, 5, invoke);
    expect(res.success).toBe(false);
    expect(res.error).toContain('volume is in use');
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe('pruneReplayKitResources', () => {
  it('prunes orphaned ReplayKit resources while protecting compose resources', async () => {
    const executedCommands: string[][] = [];

    const mockDocker: typeof docker = vi.fn().mockImplementation(async (args: string[]) => {
      executedCommands.push(args);
      const cmd = args.join(' ');

      if (cmd.startsWith('ps -a --filter label=replaykit.run')) {
        return {
          code: 0,
          stdout: JSON.stringify({
            ID: 'cid-orphan-1',
            Names: 'rk-candidate-abc',
            Labels: 'replaykit.run=run-abc',
            State: 'exited',
            Status: 'Exited (1)',
          }) + '\n',
          stderr: '',
        };
      }
      if (cmd.startsWith('ps -a --filter name=rk-')) {
        return {
          code: 0,
          stdout: JSON.stringify({
            ID: 'cid-compose-1',
            Names: 'rk-dev-compose',
            Labels: 'com.docker.compose.project=replaykit',
            State: 'running',
            Status: 'Up 2 hours',
          }) + '\n',
          stderr: '',
        };
      }
      if (cmd.startsWith('network ls --filter label=replaykit.run')) {
        return {
          code: 0,
          stdout: JSON.stringify({
            ID: 'net-orphan-1',
            Name: 'rk-net-abc',
            Labels: 'replaykit.run=run-abc',
          }) + '\n',
          stderr: '',
        };
      }
      if (cmd.startsWith('network ls --filter name=rk-')) {
        return { code: 0, stdout: '', stderr: '' };
      }
      if (cmd.startsWith('volume ls --filter label=replaykit.run')) {
        return {
          code: 0,
          stdout: JSON.stringify({
            Name: 'rk-ext-abc-case',
            Labels: 'replaykit.run=run-abc',
          }) + '\n',
          stderr: '',
        };
      }
      if (cmd.startsWith('volume ls --filter name=rk-ext-')) {
        return { code: 0, stdout: '', stderr: '' };
      }

      // Default success for rm / kill
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await pruneReplayKitResources({}, mockDocker);

    // Verify pruned resources
    expect(result.containers.map((c) => c.name)).toEqual(['rk-candidate-abc']);
    expect(result.networks.map((n) => n.name)).toEqual(['rk-net-abc']);
    expect(result.volumes.map((v) => v.name)).toEqual(['rk-ext-abc-case']);
    expect(result.errors).toEqual([]);

    // Verify commands executed
    const flatCmds = executedCommands.map((c) => c.join(' '));
    expect(flatCmds).toContain('rm -f cid-orphan-1');
    expect(flatCmds).toContain('network rm net-orphan-1');
    expect(flatCmds).toContain('volume rm rk-ext-abc-case');

    // Verify compose container was NOT removed
    expect(flatCmds.some((c) => c.includes('cid-compose-1'))).toBe(false);
  });

  it('honors dryRun flag without executing removal commands', async () => {
    const executedCommands: string[][] = [];

    const mockDocker: typeof docker = vi.fn().mockImplementation(async (args: string[]) => {
      executedCommands.push(args);
      const cmd = args.join(' ');

      if (cmd.startsWith('ps -a')) {
        return {
          code: 0,
          stdout: JSON.stringify({
            ID: 'cid-dry-1',
            Names: 'rk-ext-dry',
            Labels: 'replaykit.run=dry-run',
            State: 'exited',
            Status: 'Exited (0)',
          }) + '\n',
          stderr: '',
        };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await pruneReplayKitResources({ dryRun: true }, mockDocker);
    expect(result.containers.length).toBe(1);
    expect(result.containers[0]!.name).toBe('rk-ext-dry');

    const flatCmds = executedCommands.map((c) => c.join(' '));
    // Verify no destructive removal commands were executed
    expect(flatCmds.some((c) => c.startsWith('rm') || c.includes(' rm '))).toBe(false);
  });

  it('records errors gracefully when Docker deletion fails', async () => {
    const mockDocker: typeof docker = vi.fn().mockImplementation(async (args: string[]) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('ps -a --filter label=replaykit.run')) {
        return {
          code: 0,
          stdout:
            '{"ID":"cid-err-1","Names":"rk-err","Labels":"replaykit.run=err","State":"exited","Status":"Exited"}\nmalformed json line\n',
          stderr: '',
        };
      }
      if (cmd.startsWith('rm -f cid-err-1')) {
        return { code: 1, stdout: '', stderr: 'Error: permission denied or daemon failure' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await pruneReplayKitResources({}, mockDocker);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.resource).toBe('container:rk-err');
    expect(result.errors[0]!.error).toContain('permission denied');
  });

  it('safely performs dry-run scan against live Docker daemon without modifying state', async () => {
    const dryResult = await pruneReplayKitResources({ dryRun: true });
    expect(Array.isArray(dryResult.containers)).toBe(true);
    expect(Array.isArray(dryResult.networks)).toBe(true);
    expect(Array.isArray(dryResult.volumes)).toBe(true);
    expect(dryResult.errors).toEqual([]);

    // Every identified container must be a valid ReplayKit resource
    for (const c of dryResult.containers) {
      expect(isReplayKitResource('container', c.name, c.labels)).toBe(true);
    }
    // Every identified network must be a valid ReplayKit network
    for (const n of dryResult.networks) {
      expect(isReplayKitResource('network', n.name, n.labels)).toBe(true);
    }
  }, 60000);
});

describe('InFlightResourceTracker', () => {
  it('registers, unregisters, and emergency-cleans resources', async () => {
    const tracker = InFlightResourceTracker.getInstance();
    tracker.registerContainer('test-cnt-1');
    tracker.registerVolume('test-vol-1');

    expect(tracker.getActiveCounts()).toEqual({ containers: 1, volumes: 1 });

    const executedCommands: string[][] = [];
    const mockDocker: typeof docker = vi.fn().mockImplementation(async (args: string[]) => {
      executedCommands.push(args);
      return { code: 0, stdout: '', stderr: '' };
    });

    await tracker.emergencyCleanup(mockDocker);
    expect(tracker.getActiveCounts()).toEqual({ containers: 0, volumes: 0 });

    const flatCmds = executedCommands.map((c) => c.join(' '));
    expect(flatCmds).toContain('kill --signal KILL test-cnt-1');
    expect(flatCmds).toContain('rm -f test-cnt-1');
    expect(flatCmds).toContain('volume rm test-vol-1');
  });
});

describe('docker-cleanup regression tests', () => {
  it('fast Docker enumeration executes cleanly', async () => {
    const mockDocker: typeof docker = vi.fn().mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: '',
      durationMs: 5,
    });
    const res = await executeDockerWithRetry(['ps', '-a'], { timeoutMs: 1000 }, mockDocker);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('');
    expect(mockDocker).toHaveBeenCalledTimes(1);
  });

  it('slow but successful enumeration retries and succeeds', async () => {
    let calls = 0;
    const mockDocker: typeof docker = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        const err = new Error('Docker command timed out: ps');
        (err as any).code = 'ETIMEDOUT';
        throw err;
      }
      return { code: 0, stdout: '', stderr: '', durationMs: 250 };
    });

    const res = await executeDockerWithRetry(
      ['ps', '-a'],
      { timeoutMs: 1000, maxRetries: 1 },
      mockDocker,
    );
    expect(res.code).toBe(0);
    expect(calls).toBe(2);
  });

  it('hung docker ps times out and throws DOCKER_TIMEOUT classification', async () => {
    const mockDocker: typeof docker = vi.fn().mockImplementation(async () => {
      const err = new Error('Docker command timed out: ps');
      (err as any).code = 'ETIMEDOUT';
      throw err;
    });

    await expect(
      executeDockerWithRetry(['ps', '-a'], { timeoutMs: 100, maxRetries: 0 }, mockDocker),
    ).rejects.toMatchObject({
      classification: 'DOCKER_TIMEOUT',
      message: expect.stringContaining('timed out'),
    });
  });

  it('nonzero Docker exit code fails closed and never returns empty inventory', async () => {
    const mockDocker: typeof docker = vi.fn().mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'daemon is in maintenance mode',
      durationMs: 50,
    });

    await expect(
      executeDockerWithRetry(
        ['ps', '-a'],
        { timeoutMs: 1000, maxRetries: 0, allowFailure: false },
        mockDocker,
      ),
    ).rejects.toMatchObject({
      classification: 'DOCKER_ERROR',
      message: expect.stringContaining('Docker command failed (1)'),
    });
  });

  it('malformed Docker output handles individual bad lines safely', async () => {
    const mockDocker: typeof docker = vi.fn().mockImplementation(async (args: string[]) => {
      const cmd = args.join(' ');
      if (cmd.startsWith('ps -a --filter label=replaykit.run')) {
        return {
          code: 0,
          stdout:
            '{"ID":"cid-valid","Names":"rk-valid","Labels":"replaykit.run=r1","State":"exited","Status":"Exited"}\n{invalid-json\n',
          stderr: '',
        };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await pruneReplayKitResources({ dryRun: true }, mockDocker);
    expect(result.containers.length).toBe(1);
    expect(result.containers[0]!.name).toBe('rk-valid');
  });

  it('correctly handles zero ReplayKit resources with no removals', async () => {
    const mockDocker: typeof docker = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const result = await pruneReplayKitResources({ dryRun: true }, mockDocker);
    expect(result.containers).toEqual([]);
    expect(result.networks).toEqual([]);
    expect(result.volumes).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('strictly protects unrelated user Compose and development resources', () => {
    // Exact user containers mentioned in the operator report
    expect(
      isReplayKitResource('container', 'replaykit-postgres-1', {
        'com.docker.compose.project': 'replaykit',
      }),
    ).toBe(false);
    expect(
      isReplayKitResource('container', 'dockroute-demo-app-1', {}),
    ).toBe(false);
    expect(
      isReplayKitResource('container', 'dockroute-demo-api-1', {}),
    ).toBe(false);

    // Exact user networks mentioned in operator report
    expect(
      isReplayKitResource('network', 'dockroute-demo_default', {}),
    ).toBe(false);
    expect(
      isReplayKitResource('network', 'replaykit_default', {}),
    ).toBe(false);
    expect(
      isReplayKitResource('network', 'dra-76c6c3ebe952_default', {}),
    ).toBe(false);

    // User dev volumes
    expect(
      isReplayKitResource('volume', 'replaykit_replaykit-dev-data', {}),
    ).toBe(false);
    expect(
      isReplayKitResource('volume', 'replaykit-dev-3949333504df23d5', {}),
    ).toBe(false);
  });

  it('dry-run with existing owned resources identifies them without executing rm or kill', async () => {
    const executed: string[][] = [];
    const mockDocker: typeof docker = vi.fn().mockImplementation(async (args: string[]) => {
      executed.push(args);
      const cmd = args.join(' ');
      if (cmd.startsWith('ps -a --filter label=replaykit.run')) {
        return {
          code: 0,
          stdout: JSON.stringify({
            ID: 'cid-dry-1',
            Names: 'rk-candidate-live',
            Labels: 'replaykit.run=live-run',
            State: 'running',
            Status: 'Up 10 seconds',
          }) + '\n',
          stderr: '',
        };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    const result = await pruneReplayKitResources({ dryRun: true }, mockDocker);
    expect(result.containers.length).toBe(1);
    expect(result.containers[0]!.name).toBe('rk-candidate-live');

    const flatCmds = executed.map((c) => c.join(' '));
    expect(flatCmds.some((c) => c.includes('kill') || c.startsWith('rm'))).toBe(false);
  });

  it('protects unlabeled resources with rk- prefix against broad name-prefix deletion', () => {
    // Unlabeled user resources must never be considered ReplayKit-owned
    expect(isReplayKitResource('container', 'rk-backend-api', {})).toBe(false);
    expect(isReplayKitResource('volume', 'rk-ext-user-data-case', {})).toBe(false);
    expect(isReplayKitResource('network', 'rk-net-corporate', {})).toBe(false);
    expect(isReplayKitResource('container', 'rk-db-replica', { 'tier': 'production' })).toBe(false);
  });

  it('tracks query execution logs and durationMs in pruneReplayKitResources', async () => {
    const mockDocker: typeof docker = vi.fn().mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: '',
      durationMs: 15,
    });

    const result = await pruneReplayKitResources({ dryRun: true }, mockDocker);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(Array.isArray(result.queries)).toBe(true);
    expect(result.queries.length).toBeGreaterThan(0);
    expect(result.queries[0]?.command).toContain('docker ps');
    expect(result.queries[0]?.code).toBe(0);
  });

  it('tracks query execution logs in executeDockerWithRetry on failure', async () => {
    const queryLogs: any[] = [];
    const mockDocker: typeof docker = vi.fn().mockImplementation(async () => {
      const err = new Error('Docker command timed out: ps');
      (err as any).code = 'ETIMEDOUT';
      throw err;
    });

    await expect(
      executeDockerWithRetry(['ps', '-a'], { timeoutMs: 100, maxRetries: 0, queryLogs }, mockDocker),
    ).rejects.toMatchObject({
      classification: 'DOCKER_TIMEOUT',
    });

    expect(queryLogs.length).toBe(1);
    expect(queryLogs[0].command).toBe('docker ps -a');
    expect(queryLogs[0].code).toBe(-1);
    expect(queryLogs[0].timeoutReason).toContain('timed out');
  });
});

