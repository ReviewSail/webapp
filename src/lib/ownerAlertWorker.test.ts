// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOwnerAlertHandler } from '../../supabase/functions/owner-feedback-alerts/handler';

const job = { id:'job-a', token:'token-a', email:'owner@example.invalid', property:'Synthetic House' };
const config = { cronSecret:'test-secret',enabled:'true',resendKey:'test-key',from:'alerts@example.invalid',appUrl:'https://example.invalid' };
const request = () => new Request('https://worker.invalid', {method:'POST',headers:{authorization:'Bearer test-secret'}});
const rpc = vi.fn(); const send = vi.fn(); const pause = vi.fn().mockResolvedValue(undefined);
const run = (override = {}) => createOwnerAlertHandler({...config,...override},rpc,send,pause)(request());
beforeEach(() => {
  vi.clearAllMocks();
  let claimed = false;
  rpc.mockImplementation(async name => ({data:name==='finish_owner_alert_v1' ? true : claimed ? null : (claimed=true,job),error:null}));
  send.mockResolvedValue(new Response(JSON.stringify({id:'provider-1'}),{status:200}));
});
describe('owner alert worker with no real providers', () => {
  it('rejects a missing/wrong cron secret and non-POST before any privileged call', async () => {
    const handler=createOwnerAlertHandler(config,rpc,send,pause);
    expect((await handler(new Request('https://worker.invalid',{method:'POST'}))).status).toBe(401);
    expect((await run({cronSecret:undefined})).status).toBe(401);
    expect((await handler(new Request('https://worker.invalid'))).status).toBe(405);
    expect(rpc).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it.each([{enabled:undefined},{enabled:'false'},{resendKey:undefined},{from:undefined},{appUrl:undefined},{appUrl:'http://example.invalid'},{appUrl:'https://evil:password@example.invalid'},{appUrl:'https://example.invalid/subpath'}])('fails closed before sending when config is invalid: %j',async override=>{
    expect((await run(override)).status).toBe(503); expect(send).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_state).not.toBe('ready');
  });
  it('uses a job-specific idempotency key, verified recipient, and safe generic inbox link', async () => {
    expect((await run()).status).toBe(200); expect(send).toHaveBeenCalledTimes(1);
    const [url, options]=send.mock.calls[0]; const body=JSON.parse(options.body);
    expect(url).toBe('https://api.resend.com/emails'); expect(options.headers['Idempotency-Key']).toBe('owner-feedback/job-a');
    expect(body.to).toEqual(['owner@example.invalid']); expect(body.text).toContain('https://example.invalid/inbox');
    expect(body.text).toContain('separately through Booking.com'); expect(body).not.toHaveProperty('html');
    expect(rpc).toHaveBeenCalledWith('finish_owner_alert_v1',{p_id:job.id,p_token:job.token,p_status:'accepted',p_reason:null,p_provider_id:'provider-1'});
    expect(pause).toHaveBeenCalledWith(1050);
  });
  it.each([400,401,403,422,429])('records rejection %i without retrying',async status=>{
    send.mockResolvedValue(new Response('{}',{status})); expect((await run()).status).toBe(502);
    expect(send).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenLastCalledWith('finish_owner_alert_v1',expect.objectContaining({p_status:'failed',p_reason:'provider_rejected'}));
  });
  it.each([200,409,500,503])('holds ambiguous response %i without retrying',async status=>{
    send.mockResolvedValue(new Response('{}',{status})); expect((await run()).status).toBe(502);
    expect(send).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenLastCalledWith('finish_owner_alert_v1',expect.objectContaining({p_status:'uncertain'}));
  });
  it('holds an interrupted provider connection without retrying',async()=>{
    send.mockRejectedValue(new Error('timeout')); await run();
    expect(send).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenLastCalledWith('finish_owner_alert_v1',expect.objectContaining({p_status:'uncertain',p_reason:'transport_interrupted'}));
  });
  it('does not report success or resend when final database acknowledgement is lost',async()=>{
    rpc.mockResolvedValueOnce({data:job,error:null}).mockResolvedValueOnce({data:null,error:{message:'lost ack'}});
    expect((await run()).status).toBe(503); expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not send when claim fails or is malformed',async()=>{
    rpc.mockResolvedValue({data:{id:'broken'},error:null}); expect((await run()).status).toBe(503);
    rpc.mockResolvedValue({data:null,error:{message:'db down'}}); expect((await run()).status).toBe(503); expect(send).not.toHaveBeenCalled();
  });
  it('never exceeds the bounded 20-job batch, including skipped jobs',async()=>{
    rpc.mockResolvedValue({data:{skipped:true},error:null}); expect((await run()).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(20); expect(send).not.toHaveBeenCalled();
  });
});
