import { useSyncExternalStore } from 'react';

/**
 * Theme store — dark (default) / light, driven by a single `data-theme`
 * attribute on <html> that CSS variables in index.css key off of.
 *
 * A module-level store (not React context) keeps every consumer in sync:
 * the Header toggle and the canvas views that need to recolor on theme
 * change all read the same value without prop-drilling through App.
 */

const STORAGE_KEY = 'amr-theme';

function initialTheme() {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

let current = initialTheme();
const listeners = new Set();

function apply(theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

// Apply once at module load so the very first paint matches the stored choice.
apply(current);

function setTheme(next) {
  if (next === current) return;
  current = next;
  apply(current);
  try {
    window.localStorage.setItem(STORAGE_KEY, current);
  } catch {
    /* localStorage unavailable (private mode) — theme still applies for the session */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export default function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'dark',
  );
  return {
    theme,
    toggle: () => setTheme(current === 'dark' ? 'light' : 'dark'),
    setTheme,
  };
}
