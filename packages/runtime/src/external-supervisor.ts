import { createHash, randomBytes } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { docker } from '../../judge/src/docker.js';
import { InFlightResourceTracker, removeVolumeWithRetry } from './docker-cleanup.js';

export interface SupervisorOptions {
  runId: string;
  role: string;
  image: string;
  stagedDir: string;
  containerCommand?: string[];
  timeoutSeconds?: number;
  watchdogSeconds?: number;
  cpus?: number;
  memoryBytes?: number;
  pidsLimit?: number;
  hostBinds?: unknown[]; // Guard against host mounts
}

export interface SupervisorIsolationState {
  networkMode: string;
  user: string;
  readonlyRoot: boolean;
  capDropAll: boolean;
  noNewPrivileges: boolean;
  cpus: number;
  memoryBytes: number;
  pidsLimit: number;
  mounts: Array<{
    type: 'tmpfs';
    destination: '/tmp' | '/run' | '/workspace' | '/testbed';
  }>;
}

export interface SupervisorExecutionResult {
  runId: string;
  role: string;
  containerId: string;
  exitCode: number | null;
  executionStatus: 'COMPLETED' | 'ERROR';
  stdout: string;
  stderr: string;
  durationMs: number;
  artifacts: Record<string, Buffer>;
  isolation: SupervisorIsolationState;
  cleaned: boolean;
  error?: string;
}

interface DockerInspectOutput {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    ExitCode: number;
    OOMKilled: boolean;
    StartedAt: string;
    FinishedAt: string;
  };
  Config: {
    User: string;
    WorkingDir: string;
    Entrypoint: string[];
    Cmd: string[];
    Labels: Record<string, string>;
  };
  HostConfig: {
    NetworkMode: string;
    ReadonlyRootfs: boolean;
    CapDrop: string[];
    SecurityOpt: string[];
    NanoCpus: number;
    Memory: number;
    PidsLimit: number;
    Binds: string[] | null;
    Mounts?: Array<{
      Type: string;
      Source: string;
      Target: string;
      VolumeOptions?: { NoCopy?: boolean };
    }>;
  };
  Mounts: Array<{
    Type: string;
    Name?: string;
    Source?: string;
    Destination: string;
    Driver?: string;
    RW?: boolean;
  }>;
}

const parseDockerTimestamp = (ts: string): number => {
  // Docker emits nanosecond ISO strings like 2026-10-19T14:30:00.123456789Z
  const normalized = ts.replace(/(\.\d{3})\d+Z$/, '$1Z');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Execute a staged external benchmark revision inside an isolated Docker container.
 * Enforces --network none, read-only root, nonroot user, resource limits, and PID 1 watchdog.
 */
export async function runExternalContainer(
  options: SupervisorOptions,
): Promise<SupervisorExecutionResult> {
  // 1. Strict input validation
  if (!options.runId || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(options.runId)) {
    throw new Error('INVALID_RUN_ID');
  }
  if (!options.role || !/^[a-z0-9_-]+$/.test(options.role)) {
    throw new Error('INVALID_ROLE');
  }
  if (options.hostBinds && options.hostBinds.length > 0) {
    throw new Error('HOST_BINDS_FORBIDDEN');
  }

  const stagedReal = await realpath(options.stagedDir);
  const cpus = options.cpus ?? 1;
  const memoryBytes = options.memoryBytes ?? 256 * 1024 * 1024;
  const pidsLimit = options.pidsLimit ?? 64;
  const watchdogSeconds = options.watchdogSeconds ?? 29;
  const containerCommand = options.containerCommand ?? ['node', '/case/gate-c-supervisor.cjs'];

  if (cpus > 1) throw new Error('CPU_LIMIT_EXCEEDED');
  if (memoryBytes > 256 * 1024 * 1024) throw new Error('MEMORY_LIMIT_EXCEEDED');
  if (pidsLimit > 64) throw new Error('PIDS_LIMIT_EXCEEDED');

  const runToken = randomBytes(8).toString('hex');
  const containerName = `rk-ext-${options.runId.slice(0, 16)}-${options.role}-${runToken}`;
  const volumeName = `${containerName}-case`;

  let containerId = '';
  let volumeCreated = false;
  let containerCreated = false;
  let cleaned = false;

  const artifacts: Record<string, Buffer> = {};
  let combinedStdout = '';
  let combinedStderr = '';
  let exitCode: number | null = null;
  let executionStatus: 'COMPLETED' | 'ERROR' = 'ERROR';
  let durationMs = 0;
  let supervisorError: string | undefined;
  let isolation: SupervisorIsolationState = {
    networkMode: 'unknown',
    user: 'unknown',
    readonlyRoot: false,
    capDropAll: false,
    noNewPrivileges: false,
    cpus: 0,
    memoryBytes: 0,
    pidsLimit: 0,
    mounts: [],
  };

  try {
    // 2. Create private disposable volume with ownership labels
    const volCreate = await docker([
      'volume',
      'create',
      '--driver',
      'local',
      '--label',
      `replaykit.run=${options.runId}`,
      '--label',
      `replaykit.role=${options.role}`,
      '--label',
      'replaykit.phase=phase2',
      volumeName,
    ], { timeoutMs: 120000 });
    if (volCreate.code !== 0) {
      throw new Error(`Failed to create volume: ${volCreate.stderr}`);
    }
    volumeCreated = true;
    InFlightResourceTracker.getInstance().registerVolume(volumeName);

    // 3. Create container with strict isolation flags
    const createArgs = [
      'create',
      '--pull=never',
      '--name',
      containerName,
      '--label',
      `replaykit.run=${options.runId}`,
      '--label',
      `replaykit.role=${options.role}`,
      '--label',
      'replaykit.phase=phase2',
      '--network',
      'none',
      '--user',
      '1000:1000',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--cpus',
      String(cpus),
      '--memory',
      `${Math.floor(memoryBytes / (1024 * 1024))}m`,
      '--memory-swap',
      `${Math.floor(memoryBytes / (1024 * 1024))}m`,
      '--pids-limit',
      String(pidsLimit),
      '--tmpfs',
      '/tmp:rw,nosuid,nodev,noexec,size=32m,mode=1777',
      '--mount',
      `type=volume,source=${volumeName},target=/case,volume-nocopy`,
      '--workdir',
      '/case',
      '--env',
      'HOME=/tmp',
      '--env',
      'TMPDIR=/tmp',
      '--env',
      'NODE_OPTIONS=',
      '--env',
      'NODE_PATH=',
      '--entrypoint',
      '/usr/bin/timeout',
      options.image,
      '--verbose',
      '--signal=KILL',
      `${watchdogSeconds}s`,
      ...containerCommand,
    ];

    const createRes = await docker(createArgs, { timeoutMs: 120000 });
    if (createRes.code !== 0) {
      throw new Error(`Failed to create container: ${createRes.stderr}`);
    }
    containerCreated = true;
    containerId = createRes.stdout.trim();
    InFlightResourceTracker.getInstance().registerContainer(containerName);

    // 4. Verify isolation state via pre-start inspect
    const inspectPre = await docker(['container', 'inspect', containerName], { timeoutMs: 120000 });
    if (inspectPre.code !== 0) {
      throw new Error(`Failed to inspect container: ${inspectPre.stderr}`);
    }
    const preData = JSON.parse(inspectPre.stdout)[0] as DockerInspectOutput;

    // Verify security constraints before copying any files
    if (preData.HostConfig.NetworkMode !== 'none') {
      throw new Error('ISOLATION_FAILURE_NETWORK_NOT_NONE');
    }
    if (!preData.HostConfig.ReadonlyRootfs) {
      throw new Error('ISOLATION_FAILURE_ROOT_NOT_READONLY');
    }
    if (!preData.HostConfig.CapDrop.includes('ALL')) {
      throw new Error('ISOLATION_FAILURE_CAP_DROP_MISSING');
    }
    if (!preData.HostConfig.SecurityOpt.some((opt) => opt.includes('no-new-privileges'))) {
      throw new Error('ISOLATION_FAILURE_NO_NEW_PRIVILEGES_MISSING');
    }
    if (preData.Config.User !== '1000:1000') {
      throw new Error('ISOLATION_FAILURE_USER_NOT_NONROOT');
    }
    if (
      preData.HostConfig.Binds &&
      preData.HostConfig.Binds.filter((b) => b && b.trim()).length > 0
    ) {
      throw new Error('ISOLATION_FAILURE_HOST_BINDS_DETECTED');
    }

    // Capture validated isolation state
    isolation = {
      networkMode: preData.HostConfig.NetworkMode,
      user: preData.Config.User,
      readonlyRoot: preData.HostConfig.ReadonlyRootfs,
      capDropAll: preData.HostConfig.CapDrop.includes('ALL'),
      noNewPrivileges: preData.HostConfig.SecurityOpt.some((opt) =>
        opt.includes('no-new-privileges'),
      ),
      cpus: preData.HostConfig.NanoCpus > 0 ? preData.HostConfig.NanoCpus / 1e9 : cpus,
      memoryBytes: preData.HostConfig.Memory > 0 ? preData.HostConfig.Memory : memoryBytes,
      pidsLimit: preData.HostConfig.PidsLimit > 0 ? preData.HostConfig.PidsLimit : pidsLimit,
      mounts: [{ type: 'tmpfs', destination: '/tmp' }],
    };

    // 5. Stage files into private container volume via docker cp
    const cpRes = await docker(['cp', `${stagedReal}/.`, `${containerName}:/case`], {
      timeoutMs: 300000,
    });
    if (cpRes.code !== 0) {
      throw new Error(`Failed to copy staging files to container: ${cpRes.stderr}`);
    }

    // 6. Start container and attach
    const runTimeoutMs = (options.timeoutSeconds ?? 30) * 1000 + 10000;
    const startRes = await docker(['start', '--attach', containerName], {
      timeoutMs: runTimeoutMs,
      allowFailure: true,
    });

    combinedStdout = startRes.stdout;
    combinedStderr = startRes.stderr;

    // 7. Post-execution inspect to verify terminal state and lifetime
    const inspectPost = await docker(['container', 'inspect', containerName], {
      allowFailure: true,
    });
    if (inspectPost.code === 0) {
      const postData = JSON.parse(inspectPost.stdout)[0] as DockerInspectOutput;
      const startMs = parseDockerTimestamp(postData.State.StartedAt);
      const finishMs = parseDockerTimestamp(postData.State.FinishedAt);
      durationMs = finishMs > startMs ? finishMs - startMs : 0;

      // Extract child exit code from container inspect
      exitCode = postData.State.ExitCode;

      if (postData.State.OOMKilled) {
        executionStatus = 'ERROR';
        supervisorError = 'CONTAINER_OOM_KILLED';
      } else if (postData.State.Status === 'exited') {
        executionStatus = 'COMPLETED';
      } else {
        executionStatus = 'ERROR';
        supervisorError = `CONTAINER_UNEXPECTED_STATUS_${postData.State.Status.toUpperCase()}`;
      }
    } else {
      executionStatus = 'ERROR';
      supervisorError = `POST_EXECUTION_INSPECT_FAILED: ${inspectPost.stderr || 'Inspect exited non-zero'}`;
    }

    // 8. Recover streamed artifacts from stdout
    for (const line of combinedStdout.split(/\r?\n/)) {
      if (!line.startsWith('{"event":"gate-b-artifact"') && !line.startsWith('{"event":"artifact"'))
        continue;
      try {
        const frame = JSON.parse(line) as {
          event: string;
          path: string;
          append?: boolean;
          base64: string;
        };
        if (!frame.path || typeof frame.base64 !== 'string') continue;
        const chunk = Buffer.from(frame.base64, 'base64');
        if (frame.append && artifacts[frame.path]) {
          artifacts[frame.path] = Buffer.concat([artifacts[frame.path]!, chunk]);
        } else {
          artifacts[frame.path] = chunk;
        }
      } catch {
        // Ignore malformed individual frame
      }
    }

    // Check if the supervisor embedded internal execution records
    if (artifacts['official.json']) {
      try {
        const officialMeta = JSON.parse(artifacts['official.json'].toString('utf8'));
        if (typeof officialMeta.exitCode === 'number') {
          exitCode = officialMeta.exitCode;
        }
      } catch {
        // Fall back to container exitCode
      }
    }
  } catch (err) {
    executionStatus = 'ERROR';
    const message = err instanceof Error ? err.message : String(err);
    return {
      runId: options.runId,
      role: options.role,
      containerId,
      exitCode: null,
      executionStatus: 'ERROR',
      stdout: combinedStdout,
      stderr: combinedStderr,
      durationMs,
      artifacts,
      isolation,
      cleaned,
      error: message,
    };
  } finally {
    // 9. Guaranteed cleanup: ensure container stopped, removed, and volume removed
    try {
      if (containerCreated) {
        await docker(['kill', '--signal', 'KILL', containerName], { allowFailure: true });
        await docker(['rm', '-f', containerName], { allowFailure: true });
        InFlightResourceTracker.getInstance().unregisterContainer(containerName);
      }
      if (volumeCreated) {
        await removeVolumeWithRetry(volumeName, 3, 200, docker);
        InFlightResourceTracker.getInstance().unregisterVolume(volumeName);
      }
      cleaned = true;
    } catch {
      cleaned = false;
    }
  }

  return {
    runId: options.runId,
    role: options.role,
    containerId,
    exitCode,
    executionStatus,
    stdout: combinedStdout,
    stderr: combinedStderr,
    durationMs,
    artifacts,
    isolation,
    cleaned,
    error: supervisorError,
  };
}
