import { describe, it, expect } from 'vitest';
import { classifyFreshness, formatAge } from './freshness.js';

describe('classifyFreshness', () => {
  it('reports LIVE with zero age while data is arriving', () => {
    const f = classifyFreshness({ hasData: true, hasEverData: true, lastReceivedAt: 1000 }, 9000);
    expect(f).toEqual({ state: 'LIVE', tone: 'live', ageSec: 0 });
  });

  it('reports STALE with the elapsed age once the topic goes quiet', () => {
    const f = classifyFreshness({ hasData: false, hasEverData: true, lastReceivedAt: 1000 }, 9000);
    expect(f.state).toBe('STALE');
    expect(f.tone).toBe('stale');
    expect(f.ageSec).toBe(8);
  });

  it('never reports a negative age when the clock skews backwards', () => {
    const f = classifyFreshness({ hasData: false, hasEverData: true, lastReceivedAt: 9000 }, 1000);
    expect(f.ageSec).toBe(0);
  });

  it('reports STALE with a null age when the receive time is unknown', () => {
    const f = classifyFreshness({ hasData: false, hasEverData: true, lastReceivedAt: null }, 9000);
    expect(f.state).toBe('STALE');
    expect(f.ageSec).toBeNull();
  });

  // The core honesty guarantee (REQ-17): never-received must not look like
  // went-quiet, because STALE still shows a last-known value and NO_DATA has none.
  it('distinguishes never-received (NO_DATA) from went-quiet (STALE)', () => {
    const never = classifyFreshness({ hasData: false, hasEverData: false, lastReceivedAt: null });
    expect(never).toEqual({ state: 'NO_DATA', tone: 'idle', ageSec: null });
  });

  it('defaults to NO_DATA when called with no timing signals at all', () => {
    expect(classifyFreshness().state).toBe('NO_DATA');
    expect(classifyFreshness({}).state).toBe('NO_DATA');
  });
});

describe('formatAge', () => {
  it('renders seconds below a minute', () => {
    expect(formatAge(0)).toBe('0s');
    expect(formatAge(8)).toBe('8s');
    expect(formatAge(59)).toBe('59s');
  });

  it('switches to whole minutes at 60s and truncates the remainder', () => {
    expect(formatAge(60)).toBe('1m');
    expect(formatAge(119)).toBe('1m');
    expect(formatAge(3599)).toBe('59m');
  });

  it('switches to whole hours at 3600s', () => {
    expect(formatAge(3600)).toBe('1h');
    expect(formatAge(7300)).toBe('2h');
  });

  it('renders nothing for an unknown age rather than "null"', () => {
    expect(formatAge(null)).toBe('');
    expect(formatAge(undefined)).toBe('');
  });
});
