import { describe, it, expect, afterEach } from 'vitest';
import { themeColor, themeRGB, themeHex } from './themeColor.js';

function setToken(name, value) {
  document.documentElement.style.setProperty(`--${name}`, value);
}

describe('themeColor', () => {
  afterEach(() => {
    document.documentElement.style.cssText = '';
  });

  it('builds an opaque rgb() string from the token channels', () => {
    setToken('deck-900', '10 20 30');
    expect(themeColor('deck-900')).toBe('rgb(10 20 30)');
  });

  it('appends the alpha channel when alpha is below 1', () => {
    setToken('deck-900', '10 20 30');
    expect(themeColor('deck-900', 0.5)).toBe('rgb(10 20 30 / 0.5)');
  });

  // Canvas throws on an invalid fillStyle, so an unset token must still
  // return a usable color rather than `rgb()`.
  it('falls back to black for a token that is not defined', () => {
    expect(themeColor('does-not-exist')).toBe('#000');
  });
});

describe('themeRGB', () => {
  afterEach(() => {
    document.documentElement.style.cssText = '';
  });

  it('returns the channels as a numeric triplet', () => {
    setToken('signal-green', '34 197 94');
    expect(themeRGB('signal-green')).toEqual([34, 197, 94]);
  });

  it('falls back to black when the token is missing or malformed', () => {
    expect(themeRGB('does-not-exist')).toEqual([0, 0, 0]);
    setToken('broken', '34 197');
    expect(themeRGB('broken')).toEqual([0, 0, 0]);
    setToken('nonsense', 'red green blue');
    expect(themeRGB('nonsense')).toEqual([0, 0, 0]);
  });
});

describe('themeHex', () => {
  afterEach(() => {
    document.documentElement.style.cssText = '';
  });

  // ROS3D/THREE r89 rejects space-separated rgb(), so this path must emit
  // a legacy #rrggbb string — including zero-padding for single-digit channels.
  it('renders a zero-padded #rrggbb string', () => {
    setToken('signal-green', '34 197 94');
    expect(themeHex('signal-green')).toBe('#22c55e');
    setToken('dark', '1 2 3');
    expect(themeHex('dark')).toBe('#010203');
  });

  it('falls back to #000000 for a missing token', () => {
    expect(themeHex('does-not-exist')).toBe('#000000');
  });
});
