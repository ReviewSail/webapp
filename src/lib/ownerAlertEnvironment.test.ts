// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createOwnerAlertHandler } from '../../supabase/functions/owner-feedback-alerts/handler';

// Execute the actual entrypoint; only its remote imports and external I/O are mocked.
const source = readFileSync(new URL('../../supabase/functions/owner-feedback-alerts/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const base = { CRON_SECRET: 'synthetic-cron', OWNER_ALERTS_ENABLED: 'true', APP_URL: 'https://example.invalid' };
const owner = { OWNER_ALERT_RESEND_API_KEY: 'synthetic-owner-key', OWNER_ALERT_RESEND_FROM_EMAIL: 'owner-alerts@example.invalid' };
const shared = { RESEND_API_KEY: 'synthetic-guest-key', RESEND_FROM_EMAIL: 'guest-requests@example.invalid' };

function start(env: Record<string, string | undefined>) {
  let handler!: (request: Request) => Promise<Response>;
  let claimed = false;
  const send = vi.fn().mockResolvedValue(Response.json({ id: 'synthetic-receipt' }));
  const rpc = vi.fn(async (name, args) => {
    if (name === 'finish_owner_alert_v1') return { data: true, error: null };
    if (args.p_state !== 'ready' || claimed) return { data: null, error: null };
    claimed = true;
    return { data: { id: 'job', token: 'claim', email: 'owner@example.invalid', property: 'Synthetic House' }, error: null };
  });
  const get = vi.fn((name: string) => env[name]);
  runInNewContext(compiled, {
    exports: {}, Deno: { env: { get } },
    require: (name: string) => {
      if (name === 'https://deno.land/std@0.190.0/http/server.ts') return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name === 'https://esm.sh/@supabase/supabase-js@2.45.0') return { createClient: () => ({ rpc }) };
      if (name === './handler.ts') return { createOwnerAlertHandler: (...args: Parameters<typeof createOwnerAlertHandler>) => createOwnerAlertHandler(args[0], args[1], send, async () => {}) };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { rpc, send, get, invoke: () => handler(new Request('https://example.invalid', {
    method: 'POST', headers: { authorization: 'Bearer synthetic-cron' },
  })) };
}

describe('owner-alert entrypoint credential isolation', () => {
  it.each([
    ['no credentials', {}],
    ['shared credentials only', shared],
    ['missing owner key with shared fallback available', { ...shared, OWNER_ALERT_RESEND_FROM_EMAIL: owner.OWNER_ALERT_RESEND_FROM_EMAIL }],
    ['missing owner sender with shared fallback available', { ...shared, OWNER_ALERT_RESEND_API_KEY: owner.OWNER_ALERT_RESEND_API_KEY }],
    ['empty owner key', { ...shared, ...owner, OWNER_ALERT_RESEND_API_KEY: '' }],
    ['empty owner sender', { ...shared, ...owner, OWNER_ALERT_RESEND_FROM_EMAIL: '' }],
  ])('fails closed: %s', async (_label, settings) => {
    const test = start({ ...base, ...settings });
    const response = await test.invoke();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ state: 'configuration_missing' });
    expect(test.rpc).toHaveBeenCalledTimes(1);
    expect(test.rpc).toHaveBeenCalledWith('claim_owner_alert_v1', { p_state: 'configuration_missing' });
    expect(test.send).not.toHaveBeenCalled();
    expect(test.get.mock.calls.flat()).not.toContain('RESEND_API_KEY');
    expect(test.get.mock.calls.flat()).not.toContain('RESEND_FROM_EMAIL');
  });
  it.each([['owner only', owner], ['both credential sets', { ...shared, ...owner }]])('uses only owner credentials: %s', async (_label, settings) => {
    const test = start({ ...base, ...settings });
    expect(await (await test.invoke()).json()).toEqual({ state: 'ready', processed: 1 });
    expect(test.send).toHaveBeenCalledTimes(1);
    const init = test.send.mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer synthetic-owner-key');
    expect(JSON.parse(init.body).from).toBe('owner-alerts@example.invalid');
  });
  it.each([undefined, 'false', 'TRUE'])('still requires explicit enablement: %s', async enabled => {
    const test = start({ ...base, ...owner, OWNER_ALERTS_ENABLED: enabled });
    expect(await (await test.invoke()).json()).toEqual({ state: 'disabled' });
    expect(test.send).not.toHaveBeenCalled();
  });
});
