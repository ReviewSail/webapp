import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

// jsdom has no layout engine, so anchor clicks never fire a download. The
// wizard's template and failed-row exports go through URL.createObjectURL, so
// stub it rather than leaving the tests to throw on an unimplemented API.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
}
