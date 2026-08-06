import { QueryClient } from '@tanstack/react-query';

/**
 * Cache floors for every remote read in the app.
 *
 * Nothing here is realtime — a review request that landed thirty seconds ago
 * can wait — so the windows are deliberately long.
 *
 * `refetchOnMount` is left at its default on purpose. It only refetches data
 * that is already *stale*, so it costs nothing inside the five-minute window
 * but still means a page opened later gets fresh rows. Turning it off as well
 * would have pinned the cache until something explicitly invalidated it, which
 * is the wrong default in development: change a row in the SQL editor, or let
 * the hourly cron fire, and the dashboard would keep showing the old value
 * until a hard reload.
 *
 * Window focus is a different matter — alt-tabbing back used to re-issue every
 * query in the tree, which is pure cost for data that changes hourly at most.
 */
export const STALE_TIME_MS = 300_000; // 5 minutes
export const GC_TIME_MS = 600_000; // 10 minutes

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

export const queryClient = createQueryClient();
