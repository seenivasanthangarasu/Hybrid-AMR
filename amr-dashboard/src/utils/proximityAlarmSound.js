/**
 * Proximity Alarm Audio Synthesizer
 * Uses native Web Audio API to produce industrial acoustic collision warnings.
 * No external sound files or network requests required.
 */

const STORAGE_KEY = 'amr-lidar-proximity-sound-enabled';
const SOUND_EVENT = 'amr-lidar-sound-changed';

let audioCtx = null;
let activeIntervalId = null;
let currentSeverity = 'CLEAR'; // 'CLEAR' | 'WARNING' | 'CRITICAL'

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Checks if alarm sound is currently enabled by the operator.
 */
export function isAlarmSoundEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    // Default to true for safety monitoring, unless explicitly muted
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

/**
 * Enables or mutes the proximity alarm sound.
 */
export function setAlarmSoundEnabled(enabled) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // ignore storage restrictions
  }

  if (enabled) {
    getAudioContext();
    // Play a short pleasant confirmation pip
    playBeep(880, 0.05, 0.08);
  } else {
    stopAlarmSound();
  }

  window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: { enabled } }));
}

/**
 * Synthesizes a clean tone pulse.
 */
export function playBeep(freq = 750, durationSec = 0.08, volume = 0.15) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    // Smooth envelope attack and exponential decay to prevent speaker clicks
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  } catch {
    // Audio context may be restricted by browser autoplay policy until user gesture
  }
}

/**
 * Stops any ongoing repeating audio pulses.
 */
export function stopAlarmSound() {
  if (activeIntervalId !== null) {
    clearInterval(activeIntervalId);
    activeIntervalId = null;
  }
}

/**
 * Updates the alarm generator with the latest proximity status.
 *
 * @param {'CRITICAL' | 'WARNING' | 'CLEAR' | 'NO_DATA'} status
 * @param {number|null} minRange in meters
 */
export function updateProximityAlarmSound(status, minRange = null) {
  currentSeverity = status;

  if (!isAlarmSoundEnabled() || status === 'CLEAR' || status === 'NO_DATA') {
    stopAlarmSound();
    return;
  }

  // Calculate cadence and frequency based on threat severity
  const isCritical = status === 'CRITICAL';
  const freq = isCritical ? 880 : 587; // A5 (urgent) or D5 (caution)
  const duration = isCritical ? 0.09 : 0.07;
  const volume = isCritical ? 0.22 : 0.14;

  // Faster beep interval as obstacle gets closer
  let intervalMs = 600;
  if (isCritical) {
    // 0.5m -> 250ms, 0.1m -> 120ms
    const r = Math.max(0.05, Math.min(0.5, minRange || 0.3));
    intervalMs = Math.round(100 + (r / 0.5) * 180);
  }

  stopAlarmSound();

  // Trigger initial beep immediately
  playBeep(freq, duration, volume);

  activeIntervalId = setInterval(() => {
    if (!isAlarmSoundEnabled() || currentSeverity === 'CLEAR' || currentSeverity === 'NO_DATA') {
      stopAlarmSound();
      return;
    }
    playBeep(freq, duration, volume);
  }, intervalMs);
}
