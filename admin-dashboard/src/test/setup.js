/**
 * Vitest global setup — mirrors the pattern used in amr-dashboard.
 * Loaded via vite.config.js → test.setupFiles.
 */
import '@testing-library/jest-dom';

// Polyfill import.meta.env for tests
if (!import.meta.env) {
  // Vitest already injects import.meta.env, but we patch the specific
  // VITE_* vars our modules read so they resolve to stable values.
}

// Patch VITE vars used by hooks / services at module load time
Object.assign(import.meta.env, {
  VITE_ROSBRIDGE_URL: 'ws://localhost:9090',
  VITE_BACKEND_URL: 'http://localhost:5001',
  VITE_VIDEO_SERVER_URL: 'http://localhost:8080',
});

// Silence console.error noise from React in test output (optional)
// const originalError = console.error;
// beforeAll(() => { console.error = () => {}; });
// afterAll(() => { console.error = originalError; });
