import { calculateMetrics, reportingKey, reportingPeriod, renderSummary } from './summary.ts';
import type { Feedback, Frequency, Invitation, Location, Midstay, PropertySummary } from './summary.ts';

interface Result { data: unknown[] | null; error: unknown; count: number | null }
export interface SummaryQuery extends PromiseLike<Result> {
  eq(column: string, value: string): SummaryQuery;
  gte(column: string, value: string): SummaryQuery;
  lt(column: string, value: string): SummaryQuery;
  order(column: string): SummaryQuery;
  range(from: number, to: number): SummaryQuery;
}
export interface SummaryDatabase {
  from(table: string): { select(columns: string, options: { count: 'exact' }): SummaryQuery };
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}
export interface SummaryConfig { cronSecret?: string; resendKey?: string; from?: string; appUrl?: string }
interface Account { id: string; name: string | null }
interface User { id: string; account_id: string; email: string | null; role: string | null; full_name: string | null }
interface Preference { id: string; account_id: string; frequency: string; enabled: boolean }

// Same 50-row pages / 2,000-row bound as the app. Unlike a UI preview, an email
// must never publish partial totals: exact counts, short pages and duplicates fail closed.
export async function fetchAllPages<T extends { id: string }>(build: () => SummaryQuery): Promise<T[]> {
  const rows: T[] = [], ids = new Set<string>();
  let expected: number | undefined;
  for (let offset = 0; offset < 2000; offset += 50) {
    const { data, error, count } = await build().range(offset, offset + 49);
    if (error || !Array.isArray(data) || count === null || !Number.isInteger(count) || count < 0 || count > 2000) throw new Error('Incomplete summary data');
    if (expected !== undefined && count !== expected) throw new Error('Summary data changed during pagination');
    expected = count;
    if (data.length !== Math.min(50, count - offset)) throw new Error('Incomplete summary page');
    for (const item of data as T[]) {
      if (!item.id || ids.has(item.id)) throw new Error('Duplicate or invalid summary row');
      ids.add(item.id); rows.push(item);
    }
    if (rows.length === count) return rows;
  }
  throw new Error('Summary row ceiling exceeded');
}

async function propertySummary(db: SummaryDatabase, location: Location, frequency: Frequency, now: Date): Promise<PropertySummary> {
  const period = reportingPeriod(now, frequency, location.timezone);
  // EGRESS-COST: high — only this property's sent events in the closed reporting interval; bounded pages.
  const invitations = await fetchAllPages<Invitation>(() => db.from('review_requests')
    .select('id,sent_at,origin,orders!inner(location_id,source)', { count: 'exact' })
    .eq('orders.location_id', location.id).gte('sent_at', period.start).lt('sent_at', period.end).order('id'));
  // EGRESS-COST: high — location-scoped feedback by submission time; LEFT relations preserve QR/null-request rows.
  const feedback = await fetchAllPages<Feedback>(() => db.from('guest_feedback')
    .select('id,location_id,request_id,kind,star_rating,created_at,review_requests(orders(location_id,source))', { count: 'exact' })
    .eq('location_id', location.id).gte('created_at', period.start).lt('created_at', period.end).order('id'));
  // EGRESS-COST: high — count recorded mid-stay sends, independent of when a booking was imported.
  const midstays = await fetchAllPages<Midstay>(() => db.from('orders')
    .select('id,location_id,source,midstay_sent_at', { count: 'exact' })
    .eq('location_id', location.id).gte('midstay_sent_at', period.start).lt('midstay_sent_at', period.end).order('id'));
  return { location, period, metrics: calculateMetrics(location.id, period, invitations, feedback, midstays) };
}

function appOrigin(value: string | undefined): string {
  if (!value) throw new Error('Missing app origin');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid app origin');
  return url.origin;
}
const json = (body: object, status = 200) => Response.json(body, { status });

export function createSummaryHandler(config: SummaryConfig, createDatabase: () => SummaryDatabase, send: typeof fetch = fetch, clock: () => Date = () => new Date()) {
  return async (req: Request): Promise<Response> => {
    // Cron-only function: no browser CORS interface and no user-session authority.
    if (req.method !== 'POST') return json({ success: false, error: 'method_not_allowed' }, 405);
    if (!config.cronSecret || req.headers.get('authorization') !== `Bearer ${config.cronSecret}`) return json({ success: false, error: 'unauthorized' }, 401);
    let frequency: Frequency = 'weekly';
    try {
      const raw = await req.text();
      const body = raw ? JSON.parse(raw) : {};
      if (!body || typeof body !== 'object' || Array.isArray(body) || (body.frequency !== undefined && !['weekly', 'monthly'].includes(body.frequency))) throw new Error('Invalid frequency');
      frequency = body.frequency ?? 'weekly';
    } catch { return json({ success: false, error: 'invalid_frequency' }, 400); }
    let appUrl: string;
    try {
      // Only shared digest credentials can enable this worker. Owner-alert keys never apply.
      if (!config.resendKey || !config.from) throw new Error('Missing mail configuration');
      appUrl = appOrigin(config.appUrl);
    } catch { return json({ success: false, error: 'configuration_error', accepted: 0 }, 503); }

    let accepted = 0, failedRecipients = 0, failedAccounts = 0, skipped = 0, alreadyClaimed = 0, held = 0;
    try {
      const db = createDatabase(), now = clock();
      const periodKey = reportingKey(now, frequency);
      // EGRESS-COST: medium — explicit metadata columns with deterministic, bounded pagination.
      const accounts = await fetchAllPages<Account>(() => db.from('accounts').select('id,name', { count: 'exact' }).order('id'));
      // EGRESS-COST: medium — load preferences BEFORE sending anything; never default after a failed read.
      const preferences = await fetchAllPages<Preference>(() => db.from('digest_settings').select('id:user_id,account_id,frequency,enabled', { count: 'exact' }).order('user_id'));
      const preferenceMap = new Map(preferences.map(preference => [preference.id, preference]));
      // EGRESS-COST: medium — privileged recipients only, checked against each account below.
      const users = await fetchAllPages<User>(() => db.from('users').select('id,account_id,email,role,full_name', { count: 'exact' }).order('id'));
      for (const account of accounts) {
        const recipients = users.filter(user => {
          const preference = preferenceMap.get(user.id);
          return user.account_id === account.id && ['admin', 'owner'].includes(user.role || '') && user.email &&
            (preference ? preference.account_id === account.id && preference.enabled === true && preference.frequency === frequency : frequency === 'weekly');
        });
        if (!recipients.length) { skipped++; continue; }
        let properties: PropertySummary[];
        try {
          // EGRESS-COST: medium — account-scoped properties, not an unbounded embedded locations array.
          const locations = await fetchAllPages<Location>(() => db.from('locations')
            .select('id,account_id,name,timezone', { count: 'exact' }).eq('account_id', account.id).order('id'));
          if (!locations.length) { skipped++; continue; }
          properties = [];
          for (const location of locations) {
            if (location.account_id !== account.id) throw new Error('Property account mismatch');
            properties.push(await propertySummary(db, location, frequency, now));
          }
        } catch { failedAccounts++; continue; }
        for (const user of recipients) {
          try {
            // Render before claiming. A local rendering error must not consume
            // a recipient's one allowed provider attempt.
            const html = renderSummary(account.name || 'Your account', user.full_name || 'there', frequency, properties, appUrl);
            const token = crypto.randomUUID();
            // EGRESS-COST: low — atomic service-only claim, no email body stored.
            const claim = await db.rpc('claim_digest_send_v1', {
              p_account_id: account.id, p_recipient_id: user.id, p_frequency: frequency,
              p_period_key: periodKey, p_email: user.email, p_claim_token: token,
            });
            if (claim.error) throw new Error('Digest claim failed');
            const job = claim.data as { claimed?: boolean; id?: string; reason?: string; state?: string } | null;
            if (job?.claimed === false && job.reason === 'already_claimed') {
              if (job.state === 'accepted') alreadyClaimed++;
              else if (['started', 'rejected', 'uncertain'].includes(job.state || '')) held++;
              else throw new Error('Invalid existing digest state');
              continue;
            }
            if (job?.claimed === false && job.reason === 'recipient_ineligible') { skipped++; continue; }
            if (job?.claimed !== true || typeof job.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.id)) {
              throw new Error('Invalid digest claim receipt');
            }
            let state: 'accepted' | 'rejected' | 'uncertain' = 'uncertain';
            let reason: 'provider_rejected' | 'provider_ambiguous' | 'transport_interrupted' | 'invalid_receipt' | null = 'transport_interrupted';
            let providerId: string | null = null;
            let response: Response | null = null;
            try {
              response = await send('https://api.resend.com/emails', {
                method: 'POST', headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json',
                  'Idempotency-Key': `reviewsail-digest/${job.id}` },
                signal: AbortSignal.timeout(10000),
                body: JSON.stringify({ from: config.from, to: [user.email],
                  subject: `Your ${frequency} ReviewSail summary`, html,
                }),
              });
            } catch { /* Transport outcome is ambiguous; keep the claim. */ }
            if (response) {
              if (response.ok) {
                const receipt = await response.json().catch(() => null);
                if (typeof receipt?.id === 'string' && receipt.id.trim() && receipt.id.length <= 200) {
                  state = 'accepted'; reason = null; providerId = receipt.id;
                } else reason = 'invalid_receipt';
              } else if ([400, 401, 403, 404, 422].includes(response.status)) {
                state = 'rejected'; reason = 'provider_rejected';
              } else reason = 'provider_ambiguous';
            }
            // EGRESS-COST: low — exact claim-token acknowledgement. If this fails,
            // the started row remains held and a replay cannot contact Resend.
            const finished = await db.rpc('finish_digest_send_v1', {
              p_id: job.id, p_token: token, p_state: state, p_reason: reason, p_provider_id: providerId,
            });
            if (finished.error || finished.data !== true) throw new Error('Digest outcome not persisted');
            if (state === 'accepted') accepted++;
            else failedRecipients++;
          } catch {
            // Claim and finish failures are not retried. The claim may already
            // exist, or Resend may have accepted an interrupted request.
            failedRecipients++;
          }
        }
      }
      const success = failedAccounts === 0 && failedRecipients === 0 && held === 0;
      return json({ success, accepted, failedAccounts, failedRecipients, skipped, alreadyClaimed, held, frequency, periodKey }, success ? 200 : 503);
    } catch {
      return json({ success: false, error: 'summary_data_unavailable', accepted, failedAccounts, failedRecipients }, 503);
    }
  };
}
