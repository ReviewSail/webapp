/** Rows per request. Every list read goes out in windows of this size. */
export const PAGE_SIZE = 50;

/**
 * Ceiling on how much of a table one screen may pull, across all its pages.
 *
 * The dashboard aggregates client-side — Analytics joins orders to customers in
 * the browser and offers an "all time" range — so these reads cannot simply
 * stop at the first page without the numbers going quietly wrong. The
 * compromise is a hard ceiling that is loud when it bites: correct for every
 * account we have, and a visible warning rather than silent truncation for one
 * that outgrows it. Past this point the aggregation belongs in Postgres; see
 * the note in ReviewSailContext.
 */
export const MAX_ROWS = 2_000;

/**
 * Structural stand-in for a PostgrestFilterBuilder. `postgrest-js` is only a
 * transitive dependency, so importing its types directly would not resolve
 * under pnpm's strict layout.
 */
type RangeableBuilder = {
  range: (from: number, to: number) => PromiseLike<{ data: any; error: any }>;
};

/**
 * Reads a list in `.range()` windows instead of one unbounded request.
 *
 * `build` is called once per page so each page gets a fresh builder — a
 * PostgrestFilterBuilder is a thenable and cannot be awaited twice.
 */
export async function fetchAllPages<T = any>(
  label: string,
  build: () => RangeableBuilder,
): Promise<T[]> {
  const rows: T[] = [];

  for (let pageIndex = 0; pageIndex * PAGE_SIZE < MAX_ROWS; pageIndex++) {
    const from = pageIndex * PAGE_SIZE;
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as T[];
    rows.push(...page);

    // A short page is the last page.
    if (page.length < PAGE_SIZE) return rows;
  }

  console.warn(
    `[egress] ${label}: hit the ${MAX_ROWS}-row ceiling. This account is too ` +
      'large for client-side aggregation — move the rollups into Postgres.',
  );
  return rows;
}
