# Legacy migration source archive

This directory preserves the original numbered SQL files for historical review and isolated-fixture tests. They are **not** deployable migrations. The active Supabase CLI migration directory is `supabase/migrations/` only.

The numbered files predate the production migration-history baseline and do not use the hosted migration versions. Replaying them against production could repeat table, policy, or function changes. Keep them archived unless a future migration explicitly reads them as source text for a controlled test.

See [`audit/MIGRATION_HISTORY_RECONCILIATION.md`](../../audit/MIGRATION_HISTORY_RECONCILIATION.md) for the verified production mapping and the remaining source gap.
