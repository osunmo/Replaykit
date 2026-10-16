export interface StageTiming {
  stage: string;
  offsetMs: number;
  durationMs: number;
  status: 'COMPLETED' | 'ERROR';
}
export interface ExecutionProfile {
  wallMs: number;
  stages: StageTiming[];
}
/** Supervisor monotonic timings; these observations never establish judge gates. */
export class StageProfiler {
  private readonly started: number;
  private active?: { stage: string; started: number; status: 'COMPLETED' | 'ERROR' };
  private readonly stages: StageTiming[] = [];
  constructor(private readonly clock: () => number = () => performance.now()) {
    this.started = clock();
  }
  private close(now: number) {
    if (!this.active) return;
    this.stages.push({
      stage: this.active.stage,
      offsetMs: this.active.started - this.started,
      durationMs: now - this.active.started,
      status: this.active.status,
    });
    this.active = undefined;
  }
  begin(stage: string) {
    const now = this.clock();
    this.close(now);
    this.active = { stage, started: now, status: 'COMPLETED' };
  }
  fail() {
    if (this.active) this.active.status = 'ERROR';
  }
  finish(): ExecutionProfile {
    const now = this.clock();
    this.close(now);
    return { wallMs: now - this.started, stages: [...this.stages] };
  }
}
