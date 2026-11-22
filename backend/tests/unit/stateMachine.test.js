'use strict';

const { ClaimStateMachine, ClaimState } = require('../../src/services/claims/stateMachine');

const sm = new ClaimStateMachine(null, null);

const ALL_STATES = [
  'filed', 'validated', 'scoring', 'decided',
  'payout_pending', 'paid', 'closed',
  'held', 'rejected', 'cancelled', 'expired', 'disputed', 'payout_failed'
];

describe('ClaimStateMachine Transition Table', () => {
  test.each([
    ['filed', 'validated', true],
    ['filed', 'paid', false],
    ['paid', 'payout_pending', false],
    ['decided', 'held', true],
    ['decided', 'payout_pending', true],
    ['paid', 'disputed', true],
    ['paid', 'closed', true],
    ['closed', 'disputed', false],
    ['payout_failed', 'payout_pending', true],
    ['rejected', 'filed', false],
  ])('%s -> %s allowed=%s', (from, to, ok) => {
    expect(sm.canTransition(from, to)).toBe(ok);
  });

  test('terminal states have no outgoing transitions', () => {
    for (const s of ['closed', 'cancelled', 'expired']) {
      for (const t of ALL_STATES) {
        expect(sm.canTransition(s, t)).toBe(false);
      }
    }
  });

  test('exports all expected frozen state constants', () => {
    expect(ClaimState.FILED).toBe('filed');
    expect(ClaimState.PAID).toBe('paid');
    expect(ClaimState.CLOSED).toBe('closed');
    expect(ClaimState.DISPUTED).toBe('disputed');
    expect(Object.isFrozen(ClaimState)).toBe(true);
  });
});
