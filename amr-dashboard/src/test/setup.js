// Vitest global setup — extends `expect` with jest-dom matchers
// (toBeInTheDocument, toBeDisabled, …) and clears the DOM between tests.
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Polyfill localStorage in jsdom environment if missing or incomplete
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  clear() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  get length() {
    return Object.keys(this.store).length;
  }
  key(i) {
    const keys = Object.keys(this.store);
    return keys[i] || null;
  }
}

if (!globalThis.localStorage || typeof globalThis.localStorage.clear !== 'function') {
  const storageMock = new LocalStorageMock();
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      writable: true,
    });
  }
}

afterEach(() => {
  cleanup();
});

