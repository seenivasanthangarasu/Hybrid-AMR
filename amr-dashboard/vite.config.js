import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/  ·  test block: https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  // react-draggable (used directly for panel dragging and indirectly by
  // react-resizable for panel resizing, both via react-grid-layout) calls an
  // internal log() that reads `process.env.DRAGGABLE_DEBUG` on every
  // drag/resize start. The browser has no `process` global, so without this
  // define the handler throws "process is not defined" and the gesture is
  // aborted — silently breaking all panel drag/resize in Layout Edit Mode.
  // Replacing just this expression avoids dereferencing `process` at all.
  define: {
    'process.env.DRAGGABLE_DEBUG': 'false',
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    css: false,
  },
});
