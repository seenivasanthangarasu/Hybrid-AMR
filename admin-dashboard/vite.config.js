import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  test: {
    // Use jsdom to simulate a browser DOM in tests
    environment: 'happy-dom',
    // Runs before every test file
    setupFiles: ['./src/test/setup.js'],
    // Resolve __mocks__ next to src/test
    resolveSnapshotPath: (testPath, snapshotExt) => testPath + snapshotExt,
    globals: true,
    // Tell vitest where manual mocks live
    alias: {
      roslib: new URL('./src/test/__mocks__/roslib.js', import.meta.url).pathname,
    },
  },
});

