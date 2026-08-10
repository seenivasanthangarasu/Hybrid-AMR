import { describe, it, expect } from 'vitest';
import { ERRORS, ERROR_LIST, CATEGORIES, getError, errorsByCategory, diagnoseView } from './catalog.js';

describe('error catalog', () => {
  it('gives every entry the fields the dialog and reference page render', () => {
    for (const e of ERROR_LIST) {
      expect(e.code, 'code').toBeTruthy();
      expect(e.title, `${e.code} title`).toBeTruthy();
      expect(e.summary, `${e.code} summary`).toBeTruthy();
      expect(e.severity, `${e.code} severity`).toBeTruthy();
      expect(CATEGORIES[e.category], `${e.code} category is known`).toBeTruthy();
      // The whole point of the catalog: never state a fault without saying why
      // it happens and what to do about it.
      expect(e.causes.length, `${e.code} causes`).toBeGreaterThan(0);
      expect(e.remedies.length, `${e.code} remedies`).toBeGreaterThan(0);
      expect(typeof e.blocking, `${e.code} blocking`).toBe('boolean');
    }
  });

  it('keys every entry by its own code', () => {
    for (const [key, e] of Object.entries(ERRORS)) expect(e.code).toBe(key);
  });

  it('looks entries up by code and returns null for unknown ones', () => {
    expect(getError('LINK_OFFLINE')).toBe(ERRORS.LINK_OFFLINE);
    expect(getError('NOPE')).toBeNull();
  });

  it('groups every entry into exactly one category for the reference page', () => {
    const grouped = errorsByCategory().flatMap((g) => g.errors);
    expect(grouped).toHaveLength(ERROR_LIST.length);
    expect(new Set(grouped.map((e) => e.code)).size).toBe(ERROR_LIST.length);
  });
});

describe('diagnoseView', () => {
  it('blames the link before the topic when the link is down', () => {
    // A silent topic is meaningless if the link is dead — say the useful thing.
    expect(diagnoseView({ connectionStatus: 'closed', hasEverData: false })).toBe(ERRORS.LINK_OFFLINE);
    expect(diagnoseView({ connectionStatus: 'error', hasEverData: true })).toBe(ERRORS.LINK_OFFLINE);
  });

  it('reports a negotiating link as connecting, not offline', () => {
    expect(diagnoseView({ connectionStatus: 'connecting', hasEverData: false })).toBe(ERRORS.LINK_CONNECTING);
  });

  it('distinguishes never-published from went-quiet when the link is healthy', () => {
    expect(diagnoseView({ connectionStatus: 'connected', hasEverData: false })).toBe(ERRORS.TOPIC_NO_SIGNAL);
    expect(diagnoseView({ connectionStatus: 'connected', hasEverData: true })).toBe(ERRORS.DATA_STALE);
  });

  it('always blames the stream for the camera, which does not use rosbridge', () => {
    expect(diagnoseView({ connectionStatus: 'connected', hasEverData: true, isCamera: true })).toBe(
      ERRORS.CAMERA_STREAM_DOWN,
    );
    expect(diagnoseView({ connectionStatus: 'closed', hasEverData: false, isCamera: true })).toBe(
      ERRORS.CAMERA_STREAM_DOWN,
    );
  });
});
