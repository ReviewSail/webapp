export type InboxRow = {
  id: string; requestId: string | null; locationId: string; locationName: string | null;
  kind: 'rating' | 'complaint' | 'recovery'; starRating: number | null;
  feedbackText: string | null; guestName: string; guestEmail: string | null;
  isRead: boolean; createdAt: string;
};
export type InboxPage = { accountId: string; version: string; hasMore: boolean; rows: InboxRow[]; denied?: boolean };
export type InboxCursor = { createdAt: string; id: string };
const nullableString = (value: unknown) => value === null || typeof value === 'string';

/** A malformed/unchanged reply must never replace a real inbox with an empty one. */
export function readInboxPage(data: unknown, previous?: InboxPage): InboxPage {
  if (!data || typeof data !== 'object') throw new Error('Invalid inbox response');
  const page = data as InboxPage;
  if (typeof page.accountId !== 'string' || typeof page.version !== 'string' || !page.version || typeof page.hasMore !== 'boolean') {
    throw new Error('Invalid inbox response');
  }
  if (page.rows === null) {
    if (!previous || previous.denied || previous.version !== page.version || previous.accountId !== page.accountId || previous.hasMore !== page.hasMore) {
      throw new Error('Unmatched inbox response');
    }
    return previous;
  }
  if (!Array.isArray(page.rows) || page.rows.length > 50 || page.rows.some(row =>
    !row || typeof row.id !== 'string' || typeof row.locationId !== 'string' || !nullableString(row.locationName) ||
    !nullableString(row.requestId) || !['rating', 'complaint', 'recovery'].includes(row.kind) ||
    !(row.starRating === null || (Number.isInteger(row.starRating) && row.starRating >= 1 && row.starRating <= 5)) ||
    !nullableString(row.feedbackText) || typeof row.guestName !== 'string' || !nullableString(row.guestEmail) ||
    typeof row.isRead !== 'boolean' || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt)))) {
    throw new Error('Invalid inbox rows');
  }
  return { accountId: page.accountId, version: page.version, hasMore: page.hasMore, rows: page.rows };
}
