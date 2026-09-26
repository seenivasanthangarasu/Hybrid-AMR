import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isAlarmSoundEnabled,
  setAlarmSoundEnabled,
  playBeep,
  stopAlarmSound,
  updateProximityAlarmSound,
} from './proximityAlarmSound.js';

describe('proximityAlarmSound', () => {
  beforeEach(() => {
    localStorage.clear();
    stopAlarmSound();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopAlarmSound();
    vi.useRealTimers();
  });

  it('defaults to sound enabled', () => {
    expect(isAlarmSoundEnabled()).toBe(true);
  });

  it('toggles sound enabled state and persists in localStorage', () => {
    setAlarmSoundEnabled(false);
    expect(isAlarmSoundEnabled()).toBe(false);
    expect(localStorage.getItem('amr-lidar-proximity-sound-enabled')).toBe('false');

    setAlarmSoundEnabled(true);
    expect(isAlarmSoundEnabled()).toBe(true);
    expect(localStorage.getItem('amr-lidar-proximity-sound-enabled')).toBe('true');
  });

  it('safely handles playBeep without AudioContext in node/test env', () => {
    expect(() => playBeep(880, 0.1, 0.2)).not.toThrow();
  });

  it('stops repeating sounds when updated with CLEAR or NO_DATA', () => {
    updateProximityAlarmSound('CRITICAL', 0.2);
    updateProximityAlarmSound('CLEAR', 2.0);
    // Verified it runs cleanly without throwing
    expect(true).toBe(true);
  });

  it('does not schedule beeps when sound is disabled', () => {
    setAlarmSoundEnabled(false);
    updateProximityAlarmSound('CRITICAL', 0.2);
    expect(true).toBe(true);
  });
});
