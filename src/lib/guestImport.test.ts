import { describe, expect, it, vi } from 'vitest';
import { runGuestImport, type BulkImportRow } from './guestImport';

const rows = (n: number): BulkImportRow[] => Array.from({ length: n }, (_, i) => ({
  firstName: 'Synthetic', lastName: String(i), email: `test${i}@example.invalid`, checkoutDate: '2026-09-01',
}));
const accepted = (batch: BulkImportRow[]) => ({ data: batch.map((_, index) => ({ index, status: 'imported' })), error: null });

describe('import acknowledgements', () => {
  it('rejects canceled rows and keeps original row indices for server failures', async () => {
    const input = rows(3); input[0].reservationStatus = 'Cancelled';
    const save = vi.fn().mockResolvedValue({ data: [{ index: 0, status: 'imported' }, { index: 1, status: 'failed', reason: 'Test failure' }], error: null });
    const result = await runGuestImport(input, save);
    expect(result).toMatchObject({ imported: 1, failed: 2, unknown: 0 });
    expect(result.issues.map(issue => issue.index)).toEqual([0, 2]);
    expect(save.mock.calls[0][0]).toEqual(input.slice(1));
  });
  it('unconfirmed and unattempted counts exclude rows already rejected locally', async () => {
    const input = rows(402); input[0].reservationStatus = 'Pending';
    const result = await runGuestImport(input, async () => { throw new Error('Offline'); });
    expect(result).toMatchObject({ failed: 1, unknown: 200, notAttempted: 201 });
  });
  it('blocks conflicting references across batch boundaries before calling the database', async () => {
    const input = rows(201); input[0].externalReference = 'B1'; input[0].reservationStatus = 'Confirmed';
    input.push({ ...input[0], reservationStatus: 'Cancelled' });
    const save = vi.fn(async batch => accepted(batch));
    const result = await runGuestImport(input, save);
    expect(result).toMatchObject({ failed: 2, imported: 200 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].some((row: BulkImportRow) => row.externalReference === 'B1')).toBe(false);
  });
  it('retains the 200 committed rows when batch 2 of 201 fails', async () => {
    const save = vi.fn().mockImplementationOnce(async batch => accepted(batch)).mockRejectedValueOnce(new Error('Offline'));
    expect(await runGuestImport(rows(201), save)).toMatchObject({ imported: 200, failed: 0, unknown: 1, notAttempted: 0, success: false });
  });
  it('does not attempt later batches after losing an acknowledgement', async () => {
    const save = vi.fn().mockResolvedValue({ error: { message: 'timeout' }, data: null });
    expect(await runGuestImport(rows(401), save)).toMatchObject({ imported: 0, failed: 0, unknown: 200, notAttempted: 201 });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], [{ index: 0, status: 'sent' }], [{ index: 1, status: 'imported' }]])('treats malformed/short responses as unconfirmed: %j', async data => {
    expect(await runGuestImport(rows(1), async () => ({ data, error: null }))).toMatchObject({ imported: 0, failed: 0, unknown: 1 });
  });
  it('rejects repeated row indices without partially counting that batch', async () => {
    expect(await runGuestImport(rows(2), async () => ({ data: [{ index: 0, status: 'imported' }, { index: 0, status: 'imported' }], error: null })))
      .toMatchObject({ imported: 0, unknown: 2 });
  });
  it('counts unordered imported, duplicate and failed rows separately', async () => {
    expect(await runGuestImport(rows(3), async () => ({ data: [
      { index: 2, status: 'failed', reason: 'Conflicting dates' },
      { index: 0, status: 'duplicate' }, { index: 1, status: 'imported' },
    ], error: null }))).toEqual({ success: false, imported: 1, skippedDuplicates: 1, failed: 1,
      unknown: 0, notAttempted: 0, issues: [{ index: 2, reason: 'Conflicting dates' }] });
  });
  it('retries a lost but committed response without creating another stay', async () => {
    const saved = new Set<string | null>(); let loseResponse = true;
    const save = async (batch: BulkImportRow[]) => {
      const data = batch.map((row, index) => {
        const status = saved.has(row.email) ? 'duplicate' : 'imported'; saved.add(row.email);
        return { index, status };
      });
      if (loseResponse) { loseResponse = false; throw new Error('Lost response'); }
      return { data, error: null };
    };
    expect((await runGuestImport(rows(2), save)).unknown).toBe(2);
    expect(await runGuestImport(rows(2), save)).toMatchObject({ imported: 0, skippedDuplicates: 2, unknown: 0, success: true });
    expect(saved.size).toBe(2);
  });
  it('does not call the server for an empty selection', async () => {
    const save = vi.fn(); expect((await runGuestImport([], save)).success).toBe(true); expect(save).not.toHaveBeenCalled();
  });
});
