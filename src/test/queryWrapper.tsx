import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Wrapper for tests that render real components rather than mocking
 * `useReviewSail`.
 *
 * Anything using `useQuery` — `ReviewSailProvider`, `TeamSettings`,
 * `TeamRecognitionCard` — throws "No QueryClient set" without a provider above
 * it. The existing suites mock the context instead and don't need this; it is
 * here so the next test that renders the real tree doesn't have to work that
 * out from the error message.
 *
 *   render(<Thing />, { wrapper: QueryWrapper })
 *
 * Each call builds a fresh client, so no cached row leaks between tests, and
 * retries are off so a deliberately failing request fails immediately instead
 * of stalling the test.
 */
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

export const QueryWrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
);
