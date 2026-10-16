export interface SchedulerOptions {
  schedule: string[];
  timeoutMs?: number;
}

export interface SchedulerEvent {
  sequence: number;
  kind: 'arrive' | 'release' | 'cancel';
  checkpoint: string;
  data?: Record<string, unknown>;
}

interface PendingOperation {
  checkpoint: string;
  waitingFor: 'arrival' | 'release';
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface Gate {
  arrived: boolean;
  released: boolean;
  releaseWait?: PendingOperation;
}

/** Controls only opted-in checkpoints; arrival order is independent of release order. */
export class CooperativeScheduler {
  private readonly schedule: readonly string[];
  private readonly timeoutMs: number;
  private readonly gates = new Map<string, Gate>();
  private readonly pending = new Set<PendingOperation>();
  private readonly eventLog: SchedulerEvent[] = [];
  private nextIndex = 0;
  private cancellation?: Error;

  constructor({ schedule, timeoutMs = 5_000 }: SchedulerOptions) {
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
      throw new Error('Scheduler timeout must be a positive integer up to 2147483647 ms');
    }
    for (const name of schedule) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new Error('Checkpoint names must be non-empty strings');
      }
      if (this.gates.has(name)) throw new Error(`Duplicate checkpoint in schedule: "${name}"`);
      this.gates.set(name, { arrived: false, released: false });
    }
    this.schedule = [...schedule];
    this.timeoutMs = timeoutMs;
  }

  /** Return a snapshot so consumers cannot rewrite recorded execution evidence. */
  get events(): readonly SchedulerEvent[] {
    return structuredClone(this.eventLog);
  }

  async checkpoint(name: string, data?: Record<string, unknown>): Promise<void> {
    const gate = this.getGate(name);
    if (gate.arrived) throw new Error(`Checkpoint "${name}" already arrived`);
    const capturedData = data === undefined ? undefined : structuredClone(data);
    gate.arrived = true;
    this.record('arrive', name, capturedData);
    gate.releaseWait = this.createPending(name, 'release');
    for (const operation of this.pending) {
      if (operation.checkpoint === name && operation.waitingFor === 'arrival') operation.resolve();
    }
    return gate.releaseWait.promise;
  }

  async waitFor(name: string): Promise<void> {
    if (this.getGate(name).arrived) return;
    return this.createPending(name, 'arrival').promise;
  }

  release(name: string): void {
    const gate = this.getGate(name);
    if (gate.released) throw new Error(`Checkpoint "${name}" already released`);
    if (this.schedule[this.nextIndex] !== name) {
      throw new Error(`Cannot release "${name}" out of order; ${this.diagnostics()}`);
    }
    if (!gate.arrived || !gate.releaseWait) {
      throw new Error(`Checkpoint "${name}" has not arrived; ${this.diagnostics()}`);
    }
    gate.released = true;
    this.nextIndex++;
    this.record('release', name);
    gate.releaseWait.resolve();
  }

  cancel(reason = 'Replay cancelled'): void {
    this.stop(new Error(`Scheduler cancelled: ${reason}; ${this.diagnostics()}`));
  }

  assertComplete(): void {
    this.assertActive();
    if (this.nextIndex !== this.schedule.length || this.pending.size > 0) {
      throw new Error(`Replay schedule is incomplete; ${this.diagnostics()}`);
    }
  }

  private assertActive(): void {
    if (this.cancellation) throw this.cancellation;
  }

  private getGate(name: string): Gate {
    this.assertActive();
    const gate = this.gates.get(name);
    if (!gate) throw new Error(`Unknown checkpoint "${name}"`);
    return gate;
  }

  private createPending(checkpoint: string, waitingFor: 'arrival' | 'release'): PendingOperation {
    let resolvePromise!: () => void;
    let rejectPromise!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const timer = setTimeout(() => {
      this.stop(
        new Error(
          `Scheduler timeout after ${this.timeoutMs} ms waiting for ${waitingFor} at "${checkpoint}"; ${this.diagnostics()}`,
        ),
        checkpoint,
      );
    }, this.timeoutMs);
    const operation: PendingOperation = {
      checkpoint,
      waitingFor,
      promise,
      resolve: () => {
        clearTimeout(timer);
        this.pending.delete(operation);
        resolvePromise();
      },
      reject: (error) => {
        clearTimeout(timer);
        this.pending.delete(operation);
        rejectPromise(error);
      },
    };
    this.pending.add(operation);
    return operation;
  }

  private stop(error: Error, checkpoint = this.schedule[this.nextIndex] ?? '<complete>'): void {
    if (this.cancellation) return;
    this.cancellation = error;
    this.record('cancel', checkpoint, { reason: error.message });
    for (const operation of this.pending) operation.reject(error);
  }

  private diagnostics(): string {
    const blocked = [...this.pending]
      .filter((operation) => operation.waitingFor === 'release')
      .map((operation) => operation.checkpoint);
    const arrivals = [...this.pending]
      .filter((operation) => operation.waitingFor === 'arrival')
      .map((operation) => operation.checkpoint);
    return `next="${this.schedule[this.nextIndex] ?? '<complete>'}"; pending=[${blocked.join(', ')}]; waiting for arrival=[${arrivals.join(', ')}]`;
  }

  private record(
    kind: SchedulerEvent['kind'],
    checkpoint: string,
    data?: Record<string, unknown>,
  ): void {
    const event: SchedulerEvent = { sequence: this.eventLog.length + 1, kind, checkpoint };
    if (data !== undefined) event.data = data;
    this.eventLog.push(event);
  }
}
