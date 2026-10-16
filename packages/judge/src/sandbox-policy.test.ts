import { describe, expect, it } from 'vitest';
import { validateBrokerRequest, checkIsolation } from './sandbox-policy.js';
const request = { orderId: 'order-1', idempotencyKey: 'key-1', amount: 100 };
describe('sandbox trust boundaries', () => {
  it('identifies a rejected protocol command distinctly from infrastructure failures', () => {
    expect(() => validateBrokerRequest({ id: 1, action: 'exec' }, request)).toThrow(
      'CANDIDATE_PROTOCOL_REJECTED',
    );
  });
  it('accepts only the captured request and bounded protocol IDs', () => {
    expect(validateBrokerRequest({ id: 1, action: 'pay', input: request }, request).action).toBe(
      'pay',
    );
    expect(() =>
      validateBrokerRequest({ id: 2, action: 'pay', input: { ...request, amount: 200 } }, request),
    ).toThrow();
    expect(() =>
      validateBrokerRequest({ id: 99, action: 'charges', orderId: 'order-1' }, request),
    ).toThrow();
  });
  it('rejects arbitrary commands, URLs, paths and cross-order reads', () => {
    for (const input of [
      { id: 1, action: 'exec', command: 'whoami' },
      { id: 1, action: 'pay', input: request, url: 'http://host.docker.internal' },
      { id: 1, action: 'charges', orderId: '../private' },
    ]) {
      expect(() => validateBrokerRequest(input, request)).toThrow();
    }
  });
  it('fails closed if isolation config is absent', () => expect(checkIsolation({})).toBe(false));
  it('requires no network, unprivileged user, read-only mounts and resource limits', () => {
    const config = {
      Config: { User: '1000:1000' },
      HostConfig: {
        NetworkMode: 'none',
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        PidsLimit: 64,
        Memory: 134217728,
        NanoCpus: 1000000000,
      },
      Mounts: [{ Destination: '/candidate', RW: false, Type: 'bind' }],
    };
    expect(checkIsolation(config)).toBe(true);
    expect(
      checkIsolation({ ...config, HostConfig: { ...config.HostConfig, NetworkMode: 'bridge' } }),
    ).toBe(false);
    expect(
      checkIsolation({
        ...config,
        Mounts: [{ Destination: '/var/run/docker.sock', RW: false, Type: 'bind' }],
      }),
    ).toBe(false);
  });
});
