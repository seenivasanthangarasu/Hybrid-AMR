// Vitest global setup — extends `expect` with jest-dom matchers
// (toBeInTheDocument, toBeDisabled, …) and clears the DOM between tests.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
