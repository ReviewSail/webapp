// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { calculateMetrics, reportingKey, reportingPeriod, totalMetrics } from '../../supabase/functions/weekly-summary/summary';
import { createSummaryHandler, fetchAllPages } from '../../supabase/functions/weekly-summary/handler';
import type { SummaryDatabase } from '../../supabase/functions/weekly-summary/handler';
import type { Feedback, Invitation, Midstay } from '../../supabase/functions/weekly-summary/summary';

const now = new Date('2026-09-24T12:00:00Z');
const property = { id: 'house', account_id: 'a', name: 'Gransäng Loft House', timezone: 'Europe/Stockholm' };
const otherProperty = { id: 'other', account_id: 'b', name: 'Other house', timezone: 'UTC' };
const stay = { location_id: 'house', source: 'booking' };
const invite = (id: string, sent_at = '2026-09-17T12:00:00Z', origin = 'email', orders = stay): Invitation => ({ id, sent_at, origin, orders });
const feedback = (id: string, kind: string, star_rating: number | null, request_id: string | null, created_at = '2026-09-18T12:00:00Z'): Feedback => ({
  id, location_id: 'house', request_id, kind, star_rating, created_at,
  review_requests: request_id ? { orders: stay } : null,
});
const config = { cronSecret: 'synthetic-secret', resendKey: 'synthetic-resend', from: 'digest@example.invalid', appUrl: 'https://app.example.invalid' };
const request = (frequency: string = 'weekly', auth = true) => new Request('https://worker.invalid', {
  method: 'POST', headers: auth ? { authorization: 'Bearer synthetic-secret' } : {}, body: JSON.stringify({ frequency }),
});

type Row = Record<string, unknown>;
function database(tables: Record<string, object[]>, failureTable?: string) {
  const calls: Array<{ table: string; columns: string; filters: string[]; range: [number, number] }> = [];
  const attempts = new Map<string, { id: string; token: string; state: string }>();
  let nextId = 1;
  const db = { from(table: string) {
    return { select(columns: string, options: { count: string }) {
      expect(options.count).toBe('exact');
      expect(columns).not.toContain('*');
      const filters: Array<(row: Row) => boolean> = [], names: string[] = [];
      let sort = '', page: [number, number] = [0, 49];
      const field = (row: Row, path: string): unknown => path.split('.').reduce<unknown>((value, key) =>
        value && typeof value === 'object' ? (value as Row)[key] : undefined, row);
      const chain = {
        eq(column: string, value: string) { names.push(`eq:${column}`); filters.push(row => field(row, column) === value); return chain; },
        gte(column: string, value: string) { names.push(`gte:${column}`); filters.push(row => String(field(row, column)) >= value); return chain; },
        lt(column: string, value: string) { names.push(`lt:${column}`); filters.push(row => String(field(row, column)) < value); return chain; },
        order(column: string) { sort = column; return chain; },
        range(start: number, end: number) { page = [start, end]; return chain; },
        then(resolve: (value: { data: Row[] | null; error: unknown; count: number | null }) => unknown) {
          calls.push({ table, columns, filters: names, range: page });
          if (table === failureTable) return Promise.resolve(resolve({ data: null, error: { message: 'synthetic failure' }, count: null }));
          expect(sort).not.toBe('');
          let rows = ((tables[table] || []) as Row[]).filter(row => filters.every(match => match(row)));
          rows = rows.sort((left, right) => String(left[sort]).localeCompare(String(right[sort])));
          return Promise.resolve(resolve({ data: rows.slice(page[0], page[1] + 1), error: null, count: rows.length }));
        },
      };
      return chain;
    } };
  }, async rpc(name: string, args: Record<string, unknown>) {
    if (name === 'claim_digest_send_v1') {
      const user = (tables.users || []).find(row => (row as Row).id === args.p_recipient_id) as Row | undefined;
      const preference = (tables.digest_settings || []).find(row => (row as Row).id === args.p_recipient_id) as Row | undefined;
      if (!user || user.account_id !== args.p_account_id || user.email !== args.p_email ||
          !['admin', 'owner'].includes(String(user.role)) ||
          (preference ? preference.account_id !== args.p_account_id || !preference.enabled || preference.frequency !== args.p_frequency : args.p_frequency !== 'weekly')) {
        return { data: { claimed: false, reason: 'recipient_ineligible' }, error: null };
      }
      const key = [args.p_account_id, args.p_recipient_id, args.p_frequency, args.p_period_key].join('/');
      const existing = attempts.get(key);
      if (existing) return { data: { claimed: false, reason: 'already_claimed', state: existing.state }, error: null };
      const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
      attempts.set(key, { id, token: String(args.p_claim_token), state: 'started' });
      return { data: { claimed: true, id }, error: null };
    }
    if (name === 'finish_digest_send_v1') {
      const row = [...attempts.values()].find(item => item.id === args.p_id && item.token === args.p_token);
      if (!row || row.state !== 'started') return { data: false, error: null };
      row.state = String(args.p_state);
      return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  } } as unknown as SummaryDatabase;
  return { db, calls, attempts };
}
const fixtures = () => ({
  accounts: [{ id: 'a', name: '<A & B>' }, { id: 'b', name: 'Other owner' }],
  users: [
    { id: 'a-owner', account_id: 'a', email: 'a@example.invalid', role: 'owner', full_name: '<Manager>' },
    { id: 'a-staff', account_id: 'a', email: 'staff@example.invalid', role: 'staff' },
    { id: 'b-owner', account_id: 'b', email: 'b@example.invalid', role: 'admin' },
  ],
  digest_settings: [{ id: 'b-owner', account_id: 'b', enabled: false, frequency: 'weekly' }],
  locations: [property, otherProperty],
  review_requests: [
    { ...invite('sent'), orders: stay },
    { ...invite('qr', '2026-09-17T12:00:00Z', 'qr'), orders: stay },
    { ...invite('unsent', null as unknown as string), orders: stay },
    { ...invite('test', '2026-09-17T12:00:00Z', 'email', { ...stay, source: 'reviewsail_test' }) },
    { ...invite('other', '2026-09-17T12:00:00Z', 'email', { location_id: 'other', source: 'booking' }) },
  ],
  guest_feedback: [
    feedback('rated', 'rating', 5, 'old-booking-request'),
    feedback('qr-rated', 'complaint', 2, null),
    feedback('followup', 'recovery', null, null),
    { ...feedback('test-rated', 'rating', 5, 'test'), review_requests: { orders: { ...stay, source: 'reviewsail_test' } } },
    { ...feedback('other-rated', 'rating', 1, null), location_id: 'other' },
    feedback('old-rated', 'rating', 4, 'old', '2026-09-10T12:00:00Z'),
  ],
  orders: [
    { id: 'old-booking', ...stay, midstay_sent_at: '2026-09-18T12:00:00Z' },
    { id: 'test-booking', location_id: 'house', source: 'reviewsail_test', midstay_sent_at: '2026-09-18T12:00:00Z' },
  ],
});

describe('weekly summary reporting dates and meaning', () => {
  it('uses seven complete property-local days and handles a 25-hour DST day', () => {
    const period = reportingPeriod(new Date('2026-10-28T12:00:00Z'), 'weekly', 'Europe/Stockholm');
    expect(period.firstDay).toBe('2026-10-19'); expect(period.lastDay).toBe('2026-10-25');
    expect((Date.parse(period.end) - Date.parse(period.start)) / 3600000).toBe(169);
  });
  it('uses the previous completed calendar month, including leap day, and holds an incomplete western period', () => {
    const march = reportingPeriod(new Date('2024-04-01T12:00:00Z'), 'monthly', 'Europe/Stockholm');
    expect(march.firstDay).toBe('2024-03-01'); expect(march.lastDay).toBe('2024-03-31');
    expect(() => reportingPeriod(new Date('2026-04-01T08:00:00Z'), 'monthly', 'Pacific/Honolulu')).toThrow('not complete');
    expect(() => reportingPeriod(now, 'weekly', 'Invalid/Zone')).toThrow();
  });
  it.each([
    ['2024-03-01T13:00:00Z', '2024-02-01', '2024-02-29'],
    ['2026-04-01T13:00:00Z', '2026-03-01', '2026-03-31'],
  ])('13:00 UTC on %s closes the prior month in every tested edge timezone', (instant, first, last) => {
    for (const timezone of ['Etc/GMT+12', 'Pacific/Honolulu', 'America/Los_Angeles', 'UTC',
      'Europe/Stockholm', 'Pacific/Auckland', 'Pacific/Kiritimati']) {
      const period = reportingPeriod(new Date(instant), 'monthly', timezone);
      expect([period.firstDay, period.lastDay]).toEqual([first, last]);
      expect(Date.parse(period.end)).toBeLessThanOrEqual(Date.parse(instant));
    }
    expect(() => reportingPeriod(new Date(instant.replace('13:00', '08:00')), 'monthly', 'Etc/GMT+12')).toThrow('not complete');
  });
  it('counts event timestamps from older bookings, QR responses and weighted ratings without public-review claims', () => {
    const period = reportingPeriod(now, 'weekly', property.timezone);
    const metrics = calculateMetrics('house', period,
      [invite('sent'), invite('qr', '2026-09-17T12:00:00Z', 'qr'), invite('test', '2026-09-17T12:00:00Z', 'email', { ...stay, source: 'reviewsail_test' })],
      [feedback('rated', 'rating', 5, 'old'), feedback('qr', 'complaint', 2, null), feedback('followup', 'recovery', null, null)],
      [{ id: 'old-stay', ...stay, midstay_sent_at: '2026-09-18T12:00:00Z' }]);
    expect(metrics).toEqual({ invitations: 1, ratings: 2, ratingSum: 7, lowRatings: 1, followups: 1, midstay: 1 });
    expect(totalMetrics([{ location: property, period, metrics }, { location: otherProperty, period, metrics: { ...metrics, ratings: 1, ratingSum: 1 } }]).ratingSum).toBe(8);
  });
});

describe('weekly summary scheduled handler with synthetic database and provider', () => {
  it('sends one tenant-isolated summary with truthful event counts and escaped names', async () => {
    const { db, calls } = database(fixtures());
    const send = vi.fn().mockResolvedValue(Response.json({ id: 'synthetic-provider-id' }));
    const response = await createSummaryHandler(config, () => db, send, () => now)(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, accepted: 1, frequency: 'weekly' });
    expect(send).toHaveBeenCalledTimes(1);
    const message = JSON.parse(send.mock.calls[0][1].body);
    expect(message.to).toEqual(['a@example.invalid']);
    expect(message.html).toContain('Invitations recorded sent: <strong>1</strong>');
    expect(message.html).toContain('Guest ratings received: <strong>2</strong>');
    expect(message.html).toContain('Average guest rating: <strong>3.5</strong>');
    expect(message.html).toContain('Low ratings (1–3 stars): <strong>1</strong>');
    expect(message.html).toContain('Follow-up messages: <strong>1</strong>');
    expect(message.html).toContain('Mid-stay check-ins recorded sent: <strong>1</strong>');
    expect(message.html).toContain('&lt;A &amp; B&gt;'); expect(message.html).toContain('&lt;Manager&gt;');
    expect(message.html).not.toContain('Other house'); expect(message.html).not.toContain('/unsubscribe');
    expect(calls.find(call => call.table === 'review_requests')?.filters).toContain('gte:sent_at');
    expect(calls.find(call => call.table === 'guest_feedback')?.filters).toContain('gte:created_at');
    expect(calls.find(call => call.table === 'orders')?.filters).toContain('gte:midstay_sent_at');
  });
  it('anchors a weekly report through a late rerun and never sends an accepted period twice', async () => {
    const { db, attempts } = database(fixtures());
    const send = vi.fn().mockResolvedValue(Response.json({ id: 'provider-1' }));
    const monday = new Date('2026-09-21T10:00:00Z');
    expect(reportingKey(monday, 'weekly')).toBe('2026-09-21');
    expect(reportingKey(now, 'weekly')).toBe('2026-09-21');
    const first = await createSummaryHandler(config, () => db, send, () => monday)(request());
    const repeat = await createSummaryHandler(config, () => db, send, () => now)(request());
    expect(first.status).toBe(200); expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({ accepted: 0, alreadyClaimed: 1, periodKey: '2026-09-21' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].headers['Idempotency-Key']).toMatch(/^reviewsail-digest\/00000000-/);
    expect([...attempts.values()].map(item => item.state)).toEqual(['accepted']);
  });
  it('uses a separate stable monthly key for an opted-in owner', async () => {
    const rows = fixtures();
    rows.digest_settings.push({ id: 'a-owner', account_id: 'a', enabled: true, frequency: 'monthly' });
    const { db, attempts } = database(rows), send = vi.fn().mockResolvedValue(Response.json({ id: 'provider-monthly' }));
    const handler = createSummaryHandler(config, () => db, send, () => now);
    expect(reportingKey(now, 'monthly')).toBe('2026-09-01');
    expect((await handler(request('monthly'))).status).toBe(200);
    const replay = await handler(request('monthly'));
    expect(await replay.json()).toMatchObject({ accepted: 0, alreadyClaimed: 1, periodKey: '2026-09-01' });
    expect(send).toHaveBeenCalledTimes(1); expect(attempts.size).toBe(1);
  });
  it('waits for a western property to close its month before claiming or sending', async () => {
    const rows = fixtures();
    rows.locations[0] = { ...property, timezone: 'Etc/GMT+12' };
    rows.digest_settings.push({ id: 'a-owner', account_id: 'a', enabled: true, frequency: 'monthly' });
    const { db, attempts } = database(rows);
    const send = vi.fn().mockResolvedValue(Response.json({ id: 'provider-monthly' }));
    const early = await createSummaryHandler(config, () => db, send, () => new Date('2026-04-01T08:00:00Z'))(request('monthly'));
    expect(early.status).toBe(503);
    expect(await early.json()).toMatchObject({ accepted: 0, failedAccounts: 1 });
    expect(send).not.toHaveBeenCalled(); expect(attempts.size).toBe(0);
    const onTime = await createSummaryHandler(config, () => db, send, () => new Date('2026-04-01T13:00:00Z'))(request('monthly'));
    expect(onTime.status).toBe(200);
    expect(await onTime.json()).toMatchObject({ accepted: 1, periodKey: '2026-04-01' });
    expect(send).toHaveBeenCalledTimes(1); expect(attempts.size).toBe(1);
  });
  it('lets only one of two concurrent workers claim the same recipient and period', async () => {
    const { db, attempts } = database(fixtures());
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const send = vi.fn(async () => { await pending; return Response.json({ id: 'provider-1' }); });
    const handler = createSummaryHandler(config, () => db, send, () => now);
    const first = handler(request());
    const second = handler(request());
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect([a.status, b.status].sort()).toEqual([200, 503]);
    expect(send).toHaveBeenCalledTimes(1);
    expect([...attempts.values()].map(item => item.state)).toEqual(['accepted']);
  });
  it('holds an interrupted provider attempt across reruns, including after provider key expiry', async () => {
    const { db, attempts } = database(fixtures());
    const send = vi.fn().mockRejectedValue(new Error('synthetic timeout'));
    const handler = createSummaryHandler(config, () => db, send, () => now);
    const first = await handler(request());
    expect(first.status).toBe(503);
    expect([...attempts.values()].map(item => item.state)).toEqual(['uncertain']);
    const threeDaysLater = new Date('2026-09-27T12:00:00Z');
    const replay = await createSummaryHandler(config, () => db, send, () => threeDaysLater)(request());
    expect(replay.status).toBe(503);
    expect(await replay.json()).toMatchObject({ accepted: 0, held: 1, periodKey: '2026-09-21' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('holds a claimed send when the database loses the provider acknowledgement', async () => {
    const { db, attempts } = database(fixtures());
    const original = db.rpc.bind(db);
    db.rpc = vi.fn(async (name, args) => name === 'finish_digest_send_v1'
      ? { data: null, error: { message: 'synthetic lost acknowledgement' } } : original(name, args));
    const send = vi.fn().mockResolvedValue(Response.json({ id: 'provider-1' }));
    const handler = createSummaryHandler(config, () => db, send, () => now);
    expect((await handler(request())).status).toBe(503);
    expect([...attempts.values()].map(item => item.state)).toEqual(['started']);
    const replay = await handler(request());
    expect(replay.status).toBe(503); expect(await replay.json()).toMatchObject({ held: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not send after an ambiguous claim acknowledgement or a fresh preference change', async () => {
    const rows = fixtures(), { db, attempts } = database(rows);
    const original = db.rpc.bind(db), send = vi.fn();
    db.rpc = vi.fn(async (name, args) => {
      if (name === 'claim_digest_send_v1') {
        const result = await original(name, args);
        return { data: null, error: result.error || { message: 'synthetic lost claim receipt' } };
      }
      return original(name, args);
    });
    const handler = createSummaryHandler(config, () => db, send, () => now);
    expect((await handler(request())).status).toBe(503);
    expect((await handler(request())).status).toBe(503);
    expect(attempts.size).toBe(1); expect(send).not.toHaveBeenCalled();
    const fresh = database(rows);
    const freshRpc = fresh.db.rpc.bind(fresh.db);
    fresh.db.rpc = vi.fn(async (name, args) => {
      if (name === 'claim_digest_send_v1') rows.digest_settings.push({ id: 'a-owner', account_id: 'a', enabled: false, frequency: 'weekly' });
      return freshRpc(name, args);
    });
    expect((await createSummaryHandler(config, () => fresh.db, send, () => now)(request())).status).toBe(200);
    expect(fresh.attempts.size).toBe(0); expect(send).not.toHaveBeenCalled();
  });
  it('does not carry a digest preference into a different account', async () => {
    const rows = fixtures();
    rows.digest_settings.push({ id: 'a-owner', account_id: 'b', enabled: true, frequency: 'weekly' });
    const { db, attempts } = database(rows), send = vi.fn();
    const response = await createSummaryHandler(config, () => db, send, () => now)(request());
    expect(response.status).toBe(200);
    expect(attempts.size).toBe(0); expect(send).not.toHaveBeenCalled();
  });
  it.each(['digest_settings', 'users', 'guest_feedback'])('never sends incomplete data when %s read fails', async table => {
    const { db } = database(fixtures(), table), send = vi.fn();
    const response = await createSummaryHandler(config, () => db, send, () => now)(request());
    expect(response.status).toBe(503); expect(send).not.toHaveBeenCalled();
  });
  it('paginates and refuses more than 2,000 rows before email', async () => {
    const { db, calls } = database({ ...fixtures(), accounts: Array.from({ length: 51 }, (_, index) => ({ id: `a${String(index).padStart(3, '0')}`, name: 'Synthetic' })) });
    expect((await fetchAllPages(() => db.from('accounts').select('id,name', { count: 'exact' }).order('id'))).length).toBe(51);
    expect(calls.filter(call => call.table === 'accounts').map(call => call.range)).toEqual([[0, 49], [50, 99]]);
    const tooMany = database({ ...fixtures(), accounts: Array.from({ length: 2001 }, (_, index) => ({ id: `a${index}`, name: 'Synthetic' })) });
    const send = vi.fn();
    expect((await createSummaryHandler(config, () => tooMany.db, send, () => now)(request())).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects unauthorized calls, malformed cadence and missing shared credentials before DB or provider access', async () => {
    const db = vi.fn(), send = vi.fn();
    const handler = createSummaryHandler(config, db, send, () => now);
    expect((await handler(request('weekly', false))).status).toBe(401);
    expect((await handler(request('daily'))).status).toBe(400);
    expect((await handler(new Request('https://worker.invalid'))).status).toBe(405);
    expect((await createSummaryHandler({ ...config, resendKey: undefined }, db, send, () => now)(request())).status).toBe(503);
    expect(db).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it.each(['weekly', 'monthly'])('owner-alert-only credentials cannot activate the %s digest', async frequency => {
    const { db } = database(fixtures()), send = vi.fn();
    const ownerOnly = { cronSecret: config.cronSecret, appUrl: config.appUrl,
      ownerAlertResendKey: 'owner-only', ownerAlertFrom: 'alerts@example.invalid' };
    const blocked = await createSummaryHandler(ownerOnly, () => db, send, () => now)(request(frequency));
    expect(blocked.status).toBe(503); expect(send).not.toHaveBeenCalled();
    const enabled = await createSummaryHandler(config, () => db, vi.fn().mockResolvedValue(Response.json({ id: 'accepted' })), () => now)(request(frequency));
    expect(enabled.status).toBe(200);
  });
  it('uses Supabase client count/range query semantics without network access', async () => {
    const urls: string[] = [], headers: Headers[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      urls.push(String(input)); headers.push(new Headers(init?.headers));
      return new Response('[]', { headers: { 'content-type': 'application/json', 'content-range': '*/0' } });
    };
    const client = createClient('https://synthetic.supabase.co', 'public-synthetic-key', {
      global: { fetch: fetchMock }, auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as SummaryDatabase;
    expect(await fetchAllPages(() => client.from('accounts').select('id,name', { count: 'exact' }).order('id'))).toEqual([]);
    expect(urls[0]).toContain('/rest/v1/accounts?select=id%2Cname&order=id.asc');
    expect(headers[0].get('prefer')).toContain('count=exact');
    expect(urls[0]).toContain('offset=0&limit=50');
  });
  it.each([{ status: 503, body: {} }, { status: 200, body: {} }])('does not claim acceptance without provider receipt: %j', async result => {
    const { db } = database(fixtures());
    const send = vi.fn().mockResolvedValue(Response.json(result.body, { status: result.status }));
    const response = await createSummaryHandler(config, () => db, send, () => now)(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, accepted: 0, failedRecipients: 1 });
  });
});
