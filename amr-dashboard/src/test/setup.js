import { webcrypto } from 'node:crypto';
// Vitest global setup — extends `expect` with jest-dom matchers
// (toBeInTheDocument, toBeDisabled, …) and clears the DOM between tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
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

Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle, configurable: true });

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      setTransform: () => {},
      fillRect: () => {},
      clearRect: () => {},
      createImageData: (w,h) => ({ data: new Uint8ClampedArray(w*h*4) }),
      putImageData: () => {},
      drawImage: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      save: () => {},
      translate: () => {},
      rotate: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      restore: () => {},
      stroke: () => {},
    };
  };
}

afterEach(() => {
  cleanup();
});
