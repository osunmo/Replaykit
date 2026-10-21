import { docker } from '../../judge/src/docker.js';

export interface PruneOptions {
  dryRun?: boolean;
  minAgeMinutes?: number;
  runId?: string;
  forceKillRunning?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface PrunedResourceInfo {
  idOrName: string;
  name: string;
  type: 'container' | 'volume' | 'network';
  labels: Record<string, string>;
  createdAt?: string;
}

export interface DockerCommandExecutionLog {
  command: string;
  code: number;
  durationMs: number;
  stderr?: string;
  error?: string;
  timeoutReason?: string;
}

export interface PruneResult {
  containers: PrunedResourceInfo[];
  networks: PrunedResourceInfo[];
  volumes: PrunedResourceInfo[];
  errors: Array<{ resource: string; error: string }>;
  durationMs: number;
  queries: DockerCommandExecutionLog[];
}

export interface DockerQueryResult {
  stdout: string;
  stderr: string;
  code: number;
  durationMs: number;
}

/**
 * Execute a docker CLI query with bounded timeout, transient retry, and detailed error classification.
 */
export async function executeDockerWithRetry(
  args: string[],
  options: {
    timeoutMs?: number;
    maxRetries?: number;
    allowFailure?: boolean;
    queryLogs?: DockerCommandExecutionLog[];
  } = {},
  invoke: typeof docker = docker,
): Promise<DockerQueryResult> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const maxRetries = options.maxRetries ?? 1;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await invoke(args, { timeoutMs, allowFailure: true });
      const durationMs = res.durationMs ?? (Date.now() - t0);

      const errText = res.stderr || res.stdout;
      options.queryLogs?.push({
        command: `docker ${args.join(' ')}`,
        code: res.code,
        durationMs,
        stderr: res.stderr ? res.stderr.slice(0, 1000) : undefined,
      });

      if (
        res.code !== 0 &&
        /cannot connect to the docker daemon|daemon is not running|docker desktop is not running/i.test(
          errText,
        )
      ) {
        const err = new Error(`Docker daemon unavailable: ${errText.trim()}`);
        (err as any).classification = 'DOCKER_UNAVAILABLE';
        (err as any).durationMs = durationMs;
        (err as any).code = res.code;
        (err as any).stderr = res.stderr;
        throw err;
      }

      if (res.code !== 0 && !options.allowFailure) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        const err = new Error(`Docker command failed (${res.code}): ${errText.trim() || args[0]}`);
        (err as any).classification = 'DOCKER_ERROR';
        (err as any).durationMs = durationMs;
        (err as any).code = res.code;
        (err as any).stderr = res.stderr;
        throw err;
      }

      return {
        stdout: res.stdout,
        stderr: res.stderr,
        code: res.code,
        durationMs,
      };
    } catch (err: any) {
      lastError = err;
      const durationMs = Date.now() - t0;
      const msg = err instanceof Error ? err.message : String(err);

      if (err.classification) {
        throw err;
      }

      const isTimeout = /timed out/i.test(msg) || err.code === 'ETIMEDOUT';
      options.queryLogs?.push({
        command: `docker ${args.join(' ')}`,
        code: -1,
        durationMs,
        stderr: err?.stderr,
        timeoutReason: isTimeout ? msg : undefined,
        error: msg,
      });

      if (isTimeout) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        const timeoutErr = new Error(`Docker command timed out: ${args[0]}`);
        (timeoutErr as any).classification = 'DOCKER_TIMEOUT';
        (timeoutErr as any).durationMs = durationMs;
        (timeoutErr as any).code = err?.code ?? 'ETIMEDOUT';
        (timeoutErr as any).stderr = err?.stderr;
        throw timeoutErr;
      }

      if (/cannot connect|daemon not responding|ENOENT/i.test(msg)) {
        const unavailErr = new Error(`Docker daemon unavailable: ${msg}`);
        (unavailErr as any).classification = 'DOCKER_UNAVAILABLE';
        (unavailErr as any).durationMs = durationMs;
        (unavailErr as any).code = err?.code ?? 'ENOENT';
        (unavailErr as any).stderr = err?.stderr;
        throw unavailErr;
      }

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Docker command failed: ${args[0]}`);
}

/**
 * Parse comma-separated docker labels from CLI output into key-value map.
 * Format: "key1=val1,key2=val2"
 */
export function parseDockerLabels(labelStr?: string): Record<string, string> {
  if (!labelStr || typeof labelStr !== 'string') return {};
  const labels: Record<string, string> = {};
  for (const part of labelStr.split(',')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      labels[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    } else if (part.trim()) {
      labels[part.trim()] = '';
    }
  }
  return labels;
}

/**
 * Determine if a resource is safely owned by ReplayKit and eligible for cleanup.
 * Strictly forbids any resource associated with docker-compose or developer data.
 * Requires explicit ReplayKit-owned resource labels and run IDs; never uses broad name-prefix deletion.
 */
export function isReplayKitResource(
  type: 'container' | 'volume' | 'network',
  name: string,
  labels: Record<string, string>,
  targetRunId?: string,
): boolean {
  // Never touch compose resources or persistent developer data
  if (
    labels['com.docker.compose.project'] ||
    labels['com.docker.compose.volume'] ||
    labels['com.docker.compose.network'] ||
    name.includes('replaykit-dev') ||
    name === 'replaykit_default' ||
    name === 'dockroute-demo_default' ||
    name.startsWith('dockroute-') ||
    name.startsWith('dra-') ||
    name === 'replaykit-postgres-1' ||
    name === 'dockroute-demo-app-1' ||
    name === 'dockroute-demo-api-1'
  ) {
    return false;
  }

  // Check explicit ReplayKit-owned resource labels
  const hasReplayKitLabel = Boolean(
    labels['replaykit.run'] ||
    labels['org.replaykit.role'] ||
    labels['replaykit.role'] ||
    labels['replaykit.phase'],
  );

  // If targetRunId is specified, it must strictly match replaykit.run
  if (targetRunId) {
    return labels['replaykit.run'] === targetRunId;
  }

  // Actual cleanup requires explicit ReplayKit-owned resource labels;
  // NEVER use broad name-prefix deletion against user development resources.
  if (!hasReplayKitLabel) {
    return false;
  }

  // Verify naming consistency alongside explicit labels (defense-in-depth)
  if (type === 'container') {
    return name.startsWith('rk-ext-') || name.startsWith('rk-candidate-') || name.startsWith('rk-');
  }
  if (type === 'volume') {
    return name.startsWith('rk-ext-') || name.includes('-case');
  }
  if (type === 'network') {
    return name.startsWith('rk-net-') || name.endsWith('-net') || name.startsWith('rk-');
  }

  return false;
}

/**
 * Attempt to remove a Docker volume with exponential backoff if currently in use.
 */
export async function removeVolumeWithRetry(
  volumeName: string,
  retries = 3,
  delayMs = 250,
  invoke: typeof docker = docker,
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await invoke(['volume', 'rm', volumeName], { allowFailure: true });
    if (res.code === 0) {
      return { success: true };
    }
    const errText = res.stderr || res.stdout;
    if (/no such volume/i.test(errText)) {
      return { success: true };
    }
    if (attempt < retries && /volume is in use/i.test(errText)) {
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      continue;
    }
    return { success: false, error: errText.trim() };
  }
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Sweep and prune orphaned ReplayKit Docker resources (containers, networks, and volumes).
 * Guarantees zero interference with Docker Compose or persistent dev databases.
 */
export async function pruneReplayKitResources(
  options: PruneOptions = {},
  invoke: typeof docker = docker,
): Promise<PruneResult> {
  const startTime = performance.now();
  const queryLogs: DockerCommandExecutionLog[] = [];

  const result: PruneResult = {
    containers: [],
    networks: [],
    volumes: [],
    errors: [],
    durationMs: 0,
    queries: queryLogs,
  };

  const dryRun = options.dryRun ?? false;
  const timeoutMs = options.timeoutMs ?? 30000;
  const maxRetries = options.maxRetries ?? 1;

  // 1. Containers: Query all containers with label or rk- prefix
  const rawContainers: Array<{
    ID: string;
    Names: string;
    Labels: string;
    State: string;
    Status: string;
    CreatedAt?: string;
  }> = [];

  const contByLabel = await executeDockerWithRetry(
    ['ps', '-a', '--filter', 'label=replaykit.run', '--format', '{{json .}}'],
    { timeoutMs, maxRetries, allowFailure: false, queryLogs },
    invoke,
  );
  if (contByLabel.stdout.trim()) {
    for (const line of contByLabel.stdout.trim().split('\n')) {
      try {
        if (line.trim()) rawContainers.push(JSON.parse(line.trim()));
      } catch {}
    }
  }

  const contByName = await executeDockerWithRetry(
    ['ps', '-a', '--filter', 'name=rk-', '--format', '{{json .}}'],
    { timeoutMs, maxRetries, allowFailure: false, queryLogs },
    invoke,
  );
  if (contByName.stdout.trim()) {
    for (const line of contByName.stdout.trim().split('\n')) {
      try {
        if (line.trim()) rawContainers.push(JSON.parse(line.trim()));
      } catch {}
    }
  }

  // Deduplicate containers by ID
  const seenContainers = new Set<string>();
  for (const c of rawContainers) {
    if (!c.ID || seenContainers.has(c.ID)) continue;
    seenContainers.add(c.ID);

    const labels = parseDockerLabels(c.Labels);
    const name = c.Names.replace(/^\//, '');

    if (!isReplayKitResource('container', name, labels, options.runId)) {
      continue;
    }

    const info: PrunedResourceInfo = {
      idOrName: c.ID,
      name,
      type: 'container',
      labels,
      createdAt: c.CreatedAt,
    };

    if (!dryRun) {
      if (c.State === 'running' || options.forceKillRunning) {
        await invoke(['kill', '--signal', 'KILL', c.ID], { allowFailure: true });
      }
      const rmRes = await invoke(['rm', '-f', c.ID], { allowFailure: true });
      if (rmRes.code !== 0 && !/no such container/i.test(rmRes.stderr)) {
        result.errors.push({
          resource: `container:${name}`,
          error: rmRes.stderr.trim() || 'Failed to remove container',
        });
        continue;
      }
    }
    result.containers.push(info);
  }

  // 2. Networks: Query networks with label or rk- prefix
  // Containers must be removed first so networks are detached!
  const rawNetworks: Array<{
    ID: string;
    Name: string;
    Labels: string;
    CreatedAt?: string;
  }> = [];

  const netByLabel = await executeDockerWithRetry(
    ['network', 'ls', '--filter', 'label=replaykit.run', '--format', '{{json .}}'],
    { timeoutMs, maxRetries, allowFailure: false, queryLogs },
    invoke,
  );
  if (netByLabel.stdout.trim()) {
    for (const line of netByLabel.stdout.trim().split('\n')) {
      try {
        if (line.trim()) rawNetworks.push(JSON.parse(line.trim()));
      } catch {}
    }
  }

  const netByName = await executeDockerWithRetry(
    ['network', 'ls', '--filter', 'name=rk-', '--format', '{{json .}}'],
    { timeoutMs, maxRetries, allowFailure: false, queryLogs },
    invoke,
  );
  if (netByName.stdout.trim()) {
    for (const line of netByName.stdout.trim().split('\n')) {
      try {
        if (line.trim()) rawNetworks.push(JSON.parse(line.trim()));
      } catch {}
    }
  }

  const seenNetworks = new Set<string>();
  for (const n of rawNetworks) {
    if (!n.ID || seenNetworks.has(n.ID)) continue;
    seenNetworks.add(n.ID);

    const labels = parseDockerLabels(n.Labels);
    if (!isReplayKitResource('network', n.Name, labels, options.runId)) {
      continue;
    }

    const info: PrunedResourceInfo = {
      idOrName: n.ID,
      name: n.Name,
      type: 'network',
      labels,
      createdAt: n.CreatedAt,
    };

    if (!dryRun) {
      const rmRes = await invoke(['network', 'rm', n.ID], { allowFailure: true });
      if (rmRes.code !== 0 && !/no such network|network .* not found/i.test(rmRes.stderr)) {
        result.errors.push({
          resource: `network:${n.Name}`,
          error: rmRes.stderr.trim() || 'Failed to remove network',
        });
        continue;
      }
    }
    result.networks.push(info);
  }

  // 3. Volumes: Query volumes with label or rk- prefix
  const rawVolumes: Array<{
    Name: string;
    Labels: string;
  }> = [];

  const volByLabel = await executeDockerWithRetry(
    ['volume', 'ls', '--filter', 'label=replaykit.run', '--format', '{{json .}}'],
    { timeoutMs, maxRetries, allowFailure: false, queryLogs },
    invoke,
  );
  if (volByLabel.stdout.trim()) {
    for (const line of volByLabel.stdout.trim().split('\n')) {
      try {
        if (line.trim()) rawVolumes.push(JSON.parse(line.trim()));
      } catch {}
    }
  }

  const volByName = await executeDockerWithRetry(
    ['volume', 'ls', '--filter', 'name=rk-ext-', '--format', '{{json .}}'],
    { timeoutMs, maxRetries, allowFailure: false, queryLogs },
    invoke,
  );
  if (volByName.stdout.trim()) {
    for (const line of volByName.stdout.trim().split('\n')) {
      try {
        if (line.trim()) rawVolumes.push(JSON.parse(line.trim()));
      } catch {}
    }
  }

  const seenVolumes = new Set<string>();
  for (const v of rawVolumes) {
    if (!v.Name || seenVolumes.has(v.Name)) continue;
    seenVolumes.add(v.Name);

    const labels = parseDockerLabels(v.Labels);
    if (!isReplayKitResource('volume', v.Name, labels, options.runId)) {
      continue;
    }

    const info: PrunedResourceInfo = {
      idOrName: v.Name,
      name: v.Name,
      type: 'volume',
      labels,
    };

    if (!dryRun) {
      const rmRes = await removeVolumeWithRetry(v.Name, 3, 200, invoke);
      if (!rmRes.success && rmRes.error) {
        result.errors.push({
          resource: `volume:${v.Name}`,
          error: rmRes.error,
        });
        continue;
      }
    }
    result.volumes.push(info);
  }

  result.durationMs = performance.now() - startTime;
  return result;
}

/**
 * Active in-flight resource tracker for process interruption safety.
 * Attaches process signal handlers to ensure containers and volumes are cleaned up on SIGINT/SIGTERM.
 */
export class InFlightResourceTracker {
  private static instance: InFlightResourceTracker | null = null;
  private activeContainers = new Set<string>();
  private activeVolumes = new Set<string>();
  private handlersRegistered = false;

  public static getInstance(): InFlightResourceTracker {
    if (!InFlightResourceTracker.instance) {
      InFlightResourceTracker.instance = new InFlightResourceTracker();
    }
    return InFlightResourceTracker.instance;
  }

  public registerContainer(name: string): void {
    this.activeContainers.add(name);
    this.ensureSignalHandlers();
  }

  public unregisterContainer(name: string): void {
    this.activeContainers.delete(name);
  }

  public registerVolume(name: string): void {
    this.activeVolumes.add(name);
    this.ensureSignalHandlers();
  }

  public unregisterVolume(name: string): void {
    this.activeVolumes.delete(name);
  }

  public getActiveCounts(): { containers: number; volumes: number } {
    return {
      containers: this.activeContainers.size,
      volumes: this.activeVolumes.size,
    };
  }

  public async emergencyCleanup(invoke: typeof docker = docker): Promise<void> {
    for (const container of this.activeContainers) {
      try {
        await invoke(['kill', '--signal', 'KILL', container], { allowFailure: true });
        await invoke(['rm', '-f', container], { allowFailure: true });
      } catch {}
    }
    this.activeContainers.clear();

    for (const volume of this.activeVolumes) {
      try {
        await removeVolumeWithRetry(volume, 2, 100, invoke);
      } catch {}
    }
    this.activeVolumes.clear();
  }

  private ensureSignalHandlers(): void {
    if (this.handlersRegistered) return;
    this.handlersRegistered = true;

    const onSignal = async (signal: string) => {
      if (this.activeContainers.size > 0 || this.activeVolumes.size > 0) {
        process.stderr.write(
          `\n[ReplayKit] Interrupted by ${signal}. Performing emergency Docker cleanup...\n`,
        );
        await this.emergencyCleanup();
      }
      process.exit(130);
    };

    process.once('SIGINT', () => {
      void onSignal('SIGINT');
    });
    process.once('SIGTERM', () => {
      void onSignal('SIGTERM');
    });
  }
}
