import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAllPages, PAGE_SIZE, MAX_ROWS } from './pagedFetch';

/**
 * Stands in for a PostgrestFilterBuilder over a fixed table, recording the
 * `.range()` window each call asks for.
 */
const tableOf = (rowCount: number) => {
  const rows = Array.from({ length: rowCount }, (_, i) => ({ id: i }));
  const ranges: Array<[number, number]> = [];

  const build = () => ({
    range: (from: number, to: number) => {
      ranges.push([from, to]);
      // Postgrest's range is inclusive at both ends.
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  });

  return { build, ranges };
};

afterEach(() => vi.restoreAllMocks());

describe('fetchAllPages', () => {
  it('reads a short table in a single page', async () => {
    const table = tableOf(3);
    const out = await fetchAllPages('t', table.build);

    expect(out).toHaveLength(3);
    expect(table.ranges).toEqual([[0, PAGE_SIZE - 1]]);
  });

  it('walks consecutive, non-overlapping windows across pages', async () => {
    const table = tableOf(PAGE_SIZE * 2 + 7);
    const out = await fetchAllPages<{ id: number }>('t', table.build);

    expect(out).toHaveLength(PAGE_SIZE * 2 + 7);
    expect(out.map(r => r.id)).toEqual(out.map((_, i) => i));
    expect(table.ranges).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
      [PAGE_SIZE * 2, PAGE_SIZE * 3 - 1],
    ]);
  });

  it('stops on an exactly-full final page rather than looping forever', async () => {
    const table = tableOf(PAGE_SIZE);
    const out = await fetchAllPages('t', table.build);

    // A full page is ambiguous, so it costs one extra empty request.
    expect(out).toHaveLength(PAGE_SIZE);
    expect(table.ranges).toHaveLength(2);
  });

  it('stops at the ceiling and says so instead of truncating silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const table = tableOf(MAX_ROWS + PAGE_SIZE);

    const out = await fetchAllPages('customers', table.build);

    expect(out).toHaveLength(MAX_ROWS);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('customers');
  });

  it('surfaces a Postgrest error rather than returning a partial list', async () => {
    const build = () => ({
      range: () => Promise.resolve({ data: null, error: new Error('permission denied') }),
    });

    await expect(fetchAllPages('t', build)).rejects.toThrow('permission denied');
  });
});
