import { describe, it, expect } from 'vitest';
import { TONES, toneFor } from './signalTones.js';

describe('toneFor', () => {
  it('returns the matching tone for every key in the vocabulary', () => {
    Object.keys(TONES).forEach((key) => {
      expect(toneFor(key)).toBe(TONES[key]);
    });
  });

  // A typo'd tone must degrade to the neutral idle styling, never to a
  // meaningful color — a wrong green would misreport robot state (REQ-16).
  it('falls back to idle for unknown or missing keys', () => {
    expect(toneFor('nope')).toBe(TONES.idle);
    expect(toneFor(undefined)).toBe(TONES.idle);
    expect(toneFor(null)).toBe(TONES.idle);
  });

  it('gives every tone both a dot and a text class', () => {
    Object.entries(TONES).forEach(([key, tone]) => {
      expect(tone.dot, key).toBeTruthy();
      expect(tone.text, key).toBeTruthy();
    });
  });
});
