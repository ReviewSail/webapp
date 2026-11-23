import { blockedBookingReferences, importStatusIssue } from './bookingStatus';

export type BulkImportRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone?: string | null;
  checkoutDate: string;
  expectedArrival?: string | null;
  checkinDate?: string | null;
  source?: string | null;
  externalReference?: string | null;
  reservationStatus?: string | null;
};

export type BulkImportResult = {
  success: boolean;
  imported: number;
  skippedDuplicates: number;
  failed: number;
  unknown: number;
  notAttempted: number;
  issues: Array<{ index: number; reason: string }>;
  error?: string;
};

type RowOutcome = { index: number; status: 'imported' | 'duplicate' | 'failed'; reason?: string };
type SaveBatch = (rows: BulkImportRow[]) => PromiseLike<{ data: unknown; error: unknown }>;

export const emptyImportResult = (): BulkImportResult => ({
  success: false, imported: 0, skippedDuplicates: 0, failed: 0,
  unknown: 0, notAttempted: 0, issues: [],
});

function validOutcomes(data: unknown, length: number): data is RowOutcome[] {
  return Array.isArray(data) && data.length === length &&
    new Set(data.map(row => row?.index)).size === length && data.every(row =>
      row && Number.isInteger(row.index) && row.index >= 0 && row.index < length &&
      ['imported', 'duplicate', 'failed'].includes(row.status) &&
      (row.reason === undefined || typeof row.reason === 'string'));
}

/** Preserve acknowledged batches. A missing acknowledgement is NOT proof of rollback. */
export async function runGuestImport(rows: BulkImportRow[], saveBatch: SaveBatch): Promise<BulkImportResult> {
  const result = emptyImportResult();
  // Check the entire selection before chunking: a canceled duplicate in a
  // later chunk must not let an earlier confirmed copy create an invitation.
  const blocked = blockedBookingReferences(rows);
  const pending = rows.map((row, index) => ({ row, index })).filter(({ row, index }) => {
    const reason = importStatusIssue(row, blocked);
    if (!reason) return true;
    result.failed++;
    result.issues.push({ index, reason });
    return false;
  });
  for (let offset = 0; offset < pending.length; offset += 200) {
    const entries = pending.slice(offset, offset + 200);
    const batch = entries.map(entry => entry.row);
    try {
      const { data, error } = await saveBatch(batch);
      if (error || !validOutcomes(data, batch.length)) throw new Error('Unconfirmed batch');
      for (const row of data) {
        if (row.status === 'imported') result.imported++;
        else if (row.status === 'duplicate') result.skippedDuplicates++;
        else {
          result.failed++;
          result.issues.push({ index: entries[row.index].index, reason: row.reason || 'Could not save this row.' });
        }
      }
    } catch {
      result.unknown = batch.length;
      result.notAttempted = pending.length - offset - batch.length;
      result.error = 'The server did not confirm the last batch. It may have saved. Retry this same import to check safely; confirmed stays will be skipped.';
      return result;
    }
  }
  result.success = result.failed === 0;
  return result;
}
