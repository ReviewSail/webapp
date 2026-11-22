type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
type Config = { cronSecret?: string; enabled?: string; resendKey?: string; from?: string; appUrl?: string };
type Job = { id: string; token: string; email: string; property: string };

function inboxUrl(value?: string): string | null {
  try {
    const url = new URL(value || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return new URL('/inbox', url).href;
  } catch { return null; }
}

export function createOwnerAlertHandler(config: Config, rpc: Rpc, send: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, result: Record<string, unknown>) => new Response(JSON.stringify(result), { status, headers: { 'Content-Type': 'application/json' } });
    if (request.method !== 'POST') return reply(405, { error: 'POST required' });
    if (!config.cronSecret || request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) return reply(401, { error: 'Unauthorized' });
    const link = inboxUrl(config.appUrl);
    const state = config.enabled !== 'true' ? 'disabled' : !config.resendKey || !config.from || !link ? 'configuration_missing' : 'ready';
    let processed = 0;
    try {
      // Bounded sequential batch, also respecting provider rate limits. No
      // provider retry: an interrupted call is held for human reconciliation.
      for (let n = 0; n < 20; n++) {
        // EGRESS-COST: low — service-only atomic claim, one minimal job.
        const claimed = await rpc('claim_owner_alert_v1', { p_state: state });
        if (claimed.error) throw new Error('claim_failed');
        if (state !== 'ready') return reply(503, { state });
        if (claimed.data === null) break;
        const data = claimed.data as Partial<Job> & { skipped?: boolean };
        if (data.skipped === true) continue;
        if (!data.id || !data.token || !data.email || typeof data.property !== 'string') throw new Error('invalid_claim');
        const job = data as Job;
        let status = 'uncertain';
        let reason: string | null = 'transport_interrupted';
        let providerId: string | null = null;
        try {
          const response = await send('https://api.resend.com/emails', {
            method: 'POST', signal: AbortSignal.timeout(10_000),
            headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `owner-feedback/${job.id}` },
            body: JSON.stringify({ from: config.from, to: [job.email], subject: 'Guest feedback needs your attention',
              text: `New low-rating feedback or a follow-up is waiting for ${job.property}.\n\nOpen your ReviewSail inbox: ${link}\n\nReply to the guest separately through Booking.com or your usual channel. This email has not sent a reply to the guest.\n\nYou can turn off owner alerts in your ReviewSail inbox.` }),
          });
          const body = await response.json().catch(() => null);
          if (response.ok && typeof body?.id === 'string' && body.id.trim()) {
            status = 'accepted'; reason = null; providerId = body.id;
          } else if ([400, 401, 403, 404, 422, 429].includes(response.status)) {
            status = 'failed'; reason = 'provider_rejected';
          } else {
            reason = 'provider_ambiguous';
          }
        } catch { /* A timeout/transport failure does not prove no email was sent. */ }
        // EGRESS-COST: low — exact claim-token acknowledgement, no guest data.
        const finished = await rpc('finish_owner_alert_v1', { p_id: job.id, p_token: job.token, p_status: status, p_reason: reason, p_provider_id: providerId });
        if (finished.error || finished.data !== true) throw new Error('outcome_unconfirmed');
        processed++;
        // Stop on failure: avoid burning the rest of a queue with broken config
        // or a provider outage. A later cron run may attempt other unstarted jobs.
        if (status !== 'accepted') return reply(502, { state: status, processed });
        // Keep this worker below two sends/second. The DB also spaces claims
        // globally; other app senders still share the provider's account quota.
        await pause(1_050);
      }
      return reply(200, { state, processed });
    } catch {
      // Do not log email addresses, feedback, secrets or raw provider responses.
      console.error('[owner-feedback-alerts] Queue operation failed; check held jobs.');
      return reply(503, { error: 'Alert queue operation failed', processed });
    }
  };
}
