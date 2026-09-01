import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => ({
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
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.js'],
    resolveSnapshotPath: (testPath, snapshotExt) => testPath + snapshotExt,
    globals: true,
    alias: {
      roslib: path.resolve(__dirname, './src/test/__mocks__/roslib.js'),
    },
  },
}));
