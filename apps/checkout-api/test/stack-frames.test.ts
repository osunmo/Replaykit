import { describe, expect, it } from 'vitest';
import { applicationFrames } from '../src/stack-frames.js';

function createPayment(): Error {
  try {
    throw new Error('Same name, unrelated source');
  } catch (error) {
    return error as Error;
  }
}

describe('observed exception frame identity', () => {
  it('does not attribute an unrelated real error to the payment function', () => {
    const error = createPayment();
    error.name = 'DuplicatePaymentError';
    expect(error.stack).toContain('createPayment');
    expect(applicationFrames(error)).toEqual([{ function: 'unknown', in_app: false }]);
  });
  it('keeps an absent stack unknown instead of manufacturing a match', () => {
    const error = new Error('No stack retained');
    error.stack = undefined;
    expect(applicationFrames(error)).toEqual([{ function: 'unknown', in_app: false }]);
  });
});
