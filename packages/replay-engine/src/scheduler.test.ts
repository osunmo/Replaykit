import { afterEach, describe, expect, it, vi } from 'vitest';
import { CooperativeScheduler } from './scheduler.js';

afterEach(() => vi.useRealTimers());

describe('CooperativeScheduler', () => {
  it('holds concurrent work at checkpoints until their scheduled release', async () => {
    const scheduler = new CooperativeScheduler({ schedule: ['first', 'second'] });
    const resumed: string[] = [];
    const second = scheduler.checkpoint('second', { paymentId: 'pay-2' }).then(() => {
      resumed.push('second');
    });
    const first = scheduler.checkpoint('first').then(() => {
      resumed.push('first');
    });
    await scheduler.waitFor('first');
    await scheduler.waitFor('second');
    expect(resumed).toEqual([]);
    scheduler.release('first');
    await first;
    expect(resumed).toEqual(['first']);
    scheduler.release('second');
    await second;
    expect(resumed).toEqual(['first', 'second']);
    expect(scheduler.events).toEqual([
      { sequence: 1, kind: 'arrive', checkpoint: 'second', data: { paymentId: 'pay-2' } },
      { sequence: 2, kind: 'arrive', checkpoint: 'first' },
      { sequence: 3, kind: 'release', checkpoint: 'first' },
      { sequence: 4, kind: 'release', checkpoint: 'second' },
    ]);
    expect(() => scheduler.assertComplete()).not.toThrow();
  });

  it('notifies all arrival observers registered before the work arrives', async () => {
    const scheduler = new CooperativeScheduler({ schedule: ['insert'] });
    let arrivals = 0;
    const observers = [
      scheduler.waitFor('insert').then(() => arrivals++),
      scheduler.waitFor('insert').then(() => arrivals++),
    ];
    await Promise.resolve();
    expect(arrivals).toBe(0);
    const work = scheduler.checkpoint('insert');
    await Promise.all(observers);
    expect(arrivals).toBe(2);
    expect(() => scheduler.assertComplete()).toThrow(/insert/);
    scheduler.release('insert');
    await work;
    await expect(scheduler.waitFor('insert')).resolves.toBeUndefined();
    scheduler.assertComplete();
  });

  it('rejects a release before arrival without consuming the schedule', async () => {
    const scheduler = new CooperativeScheduler({ schedule: ['insert'] });
    expect(() => scheduler.release('insert')).toThrow(/insert.*not.*arriv/i);
    const work = scheduler.checkpoint('insert');
    scheduler.release('insert');
    await work;
    scheduler.assertComplete();
  });

  it('rejects out-of-order release without releasing either blocked task', async () => {
    const scheduler = new CooperativeScheduler({ schedule: ['read', 'write'] });
    const read = scheduler.checkpoint('read');
    const write = scheduler.checkpoint('write');
    expect(() => scheduler.release('write')).toThrow(/next.*read/i);
    expect(scheduler.events.map((event) => event.kind)).toEqual(['arrive', 'arrive']);
    scheduler.release('read');
    scheduler.release('write');
    await Promise.all([read, write]);
    scheduler.assertComplete();
  });

  it('rejects unknown names and duplicate checkpoint arrivals and releases', async () => {
    const scheduler = new CooperativeScheduler({ schedule: ['charge'] });
    await expect(scheduler.checkpoint('unknown')).rejects.toThrow(/unknown.*unknown/i);
    await expect(scheduler.waitFor('unknown')).rejects.toThrow(/unknown.*unknown/i);
    expect(() => scheduler.release('unknown')).toThrow(/unknown.*unknown/i);
    const charge = scheduler.checkpoint('charge');
    await expect(scheduler.checkpoint('charge')).rejects.toThrow(/charge.*already.*arriv/i);
    scheduler.release('charge');
    await charge;
    expect(() => scheduler.release('charge')).toThrow(/charge.*already.*releas/i);
    await expect(scheduler.checkpoint('charge')).rejects.toThrow(/charge.*already.*arriv/i);
    scheduler.assertComplete();
  });

  it('rejects invalid schedules and timeout values at construction', () => {
    expect(() => new CooperativeScheduler({ schedule: ['same', 'same'] })).toThrow(
      /duplicate.*same/i,
    );
    expect(() => new CooperativeScheduler({ schedule: [' '] })).toThrow(/name/i);
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31]) {
      expect(() => new CooperativeScheduler({ schedule: [], timeoutMs })).toThrow(/timeout/i);
    }
    expect(() => new CooperativeScheduler({ schedule: [] }).assertComplete()).not.toThrow();
  });

  it('copies the configured schedule so caller mutation cannot change replay order', async () => {
    const schedule = ['first'];
    const scheduler = new CooperativeScheduler({ schedule });
    schedule[0] = 'changed';
    const work = scheduler.checkpoint('first');
    scheduler.release('first');
    await work;
    scheduler.assertComplete();
  });

  it('rejects completion when a scheduled checkpoint has never arrived', () => {
    const scheduler = new CooperativeScheduler({ schedule: ['missing'] });
    expect(() => scheduler.assertComplete()).toThrow(/next.*missing/i);
    scheduler.cancel();
  });

  it('cancels blocked work and arrival observers and rejects future operations', async () => {
    const scheduler = new CooperativeScheduler({ schedule: ['first', 'second'] });
    const work = scheduler.checkpoint('first');
    const observer = scheduler.waitFor('second');
    const settled = Promise.allSettled([work, observer]);
    scheduler.cancel('caller aborted replay');
    expect(await settled).toEqual([
      {
        status: 'rejected',
        reason: expect.objectContaining({
          message: expect.stringContaining('caller aborted replay'),
        }),
      },
      {
        status: 'rejected',
        reason: expect.objectContaining({
          message: expect.stringContaining('caller aborted replay'),
        }),
      },
    ]);
    await expect(scheduler.checkpoint('second')).rejects.toThrow(/caller aborted replay/);
    await expect(scheduler.waitFor('first')).rejects.toThrow(/caller aborted replay/);
    expect(() => scheduler.release('first')).toThrow(/caller aborted replay/);
    expect(() => scheduler.assertComplete()).toThrow(/caller aborted replay/);
    scheduler.cancel('ignored repeated cancellation');
    expect(scheduler.events.filter((event) => event.kind === 'cancel')).toHaveLength(1);
    expect(scheduler.events.map((event) => event.sequence)).toEqual([1, 2]);
  });

  it('times out a named blocked gate and cancels every pending timer', async () => {
    vi.useFakeTimers();
    const scheduler = new CooperativeScheduler({ schedule: ['read', 'write'], timeoutMs: 50 });
    const settled = Promise.allSettled([scheduler.checkpoint('read'), scheduler.waitFor('write')]);
    await vi.advanceTimersByTimeAsync(50);
    const results = await settled;
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason.message).toMatch(/timeout.*read/i);
        expect(result.reason.message).toMatch(/next.*read/i);
        expect(result.reason.message).toMatch(/pending.*read/i);
        expect(result.reason.message).toMatch(/waiting.*write/i);
      }
    }
    expect(vi.getTimerCount()).toBe(0);
    expect(() => scheduler.assertComplete()).toThrow(/timeout/i);
  });

  it('times out waiting for a checkpoint that never arrives', async () => {
    vi.useFakeTimers();
    const scheduler = new CooperativeScheduler({ schedule: ['missing'], timeoutMs: 50 });
    const rejection = expect(scheduler.waitFor('missing')).rejects.toThrow(
      /timeout.*arrival.*missing/i,
    );
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears arrival and release deadlines when work completes', async () => {
    vi.useFakeTimers();
    const scheduler = new CooperativeScheduler({ schedule: ['done'], timeoutMs: 50 });
    const observer = scheduler.waitFor('done');
    const work = scheduler.checkpoint('done');
    await observer;
    scheduler.release('done');
    await work;
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    scheduler.assertComplete();
  });
});
