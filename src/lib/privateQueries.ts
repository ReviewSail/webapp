import type { QueryClient } from '@tanstack/react-query';

// All authenticated cache families. Public guest-link data and theme preferences
// are deliberately not removed. Keep this inventory in sync with new private queries.
const privateRoots = new Set(['reviewsail', 'inbox', 'owner-alerts', 'team', 'recognition-records']);
export function clearPrivateQueries(client: QueryClient, includeIdentity = true) {
  const filters = { predicate: (query: { queryKey: readonly unknown[] }) =>
    privateRoots.has(String(query.queryKey[0])) || (includeIdentity && query.queryKey[0] === 'auth-identity') };
  // Cancellation prevents late query results from repopulating removed entries.
  void client.cancelQueries(filters);
  client.removeQueries(filters);
}
