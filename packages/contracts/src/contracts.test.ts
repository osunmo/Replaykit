import { describe, expect, it } from 'vitest';
import { IncidentSchema, PaymentRequestSchema, ReplayPlanSchema } from './index.js';
import { incidentFixture } from './fixtures.js';

describe('contract boundaries', () => {
  it('rejects negative amounts and unexpected payload fields', () => {
    expect(
      PaymentRequestSchema.safeParse({ orderId: 'order-1', idempotencyKey: 'key-1', amount: -1 })
        .success,
    ).toBe(false);
    expect(
      PaymentRequestSchema.safeParse({
        orderId: 'order-1',
        idempotencyKey: 'key-1',
        amount: 100,
        command: 'whoami',
      }).success,
    ).toBe(false);
  });
  it('requires missing request evidence to be declared in the minimal tier', () => {
    expect(
      IncidentSchema.safeParse({ ...incidentFixture(), telemetryTier: 'minimal' }).success,
    ).toBe(false);
  });
  it('rejects unsupported schema versions', () => {
    expect(IncidentSchema.safeParse({ ...incidentFixture(), schemaVersion: 99 }).success).toBe(
      false,
    );
  });
  it('cannot label an empty candidate READY', () => {
    expect(
      ReplayPlanSchema.safeParse({
        schemaVersion: 1,
        incidentId: 'R1',
        status: 'READY',
        testSource: null,
        reasonCodes: [],
        missingEvidence: [],
        assumptions: [],
        sourceHash: 'a'.repeat(64),
      }).success,
    ).toBe(false);
  });
});
