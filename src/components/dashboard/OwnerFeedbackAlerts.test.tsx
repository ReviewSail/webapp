import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { OwnerFeedbackAlerts } from './OwnerFeedbackAlerts';

const mocks = vi.hoisted(() => ({user:'owner-a' as string|null,role:'admin',rpc:vi.fn(),signals:[] as AbortSignal[]}));
vi.mock('../../context/AuthContext',()=>({useAuth:()=>({session:mocks.user?{user:{id:mocks.user}}:null,role:mocks.role})}));
vi.mock('../../integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>{
  // Mirror Supabase's thenable query builder and abortSignal.
  const result=Promise.resolve().then(()=>mocks.rpc(...args));
  return Object.assign(result,{abortSignal:(signal:AbortSignal)=>{mocks.signals.push(signal);return result;}});
}}}));
const snapshot=(extra:Record<string,unknown>={})=>({version:'v1',data:{accountId:'account-a',email:'owner@example.invalid',enabled:false,worker:null,attentionCount:0,recent:[],...extra}});
const result=(extra:Record<string,unknown>={})=>({data:snapshot(extra),error:null});
const clients:QueryClient[]=[];
async function flush(ms=5){await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});}
async function mount(){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
  const content=()=> <QueryClientProvider client={client}><OwnerFeedbackAlerts /></QueryClientProvider>;
  const view=render(content());await flush();return {...view,client,content};}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));mocks.user='owner-a';mocks.role='admin';mocks.signals.length=0;mocks.rpc.mockReset().mockResolvedValue(result());focusManager.setFocused(true);onlineManager.setOnline(true);});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.useRealTimers();focusManager.setFocused(undefined);});
describe('owner alert settings through React and TanStack Query',()=>{
  it('defaults off, names the verified recipient, warns about inactive worker and promises no guest reply',async()=>{
    await mount();expect(screen.getByText('Preference: Off')).toBeInTheDocument();expect(screen.getByText('owner@example.invalid')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('not confirmed active');expect(screen.getByText(/Reply separately through Booking.com/)).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('get_owner_alert_status_v1',{p_known_version:null});
  });
  it('does not read or display owner data for staff or logged-out users',async()=>{
    mocks.role='staff';const view=await mount();expect(mocks.rpc).not.toHaveBeenCalled();expect(screen.queryByText('Owner email alerts')).not.toBeInTheDocument();
    mocks.role='admin';mocks.user=null;view.rerender(view.content());await flush();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires a verified email before enabling',async()=>{
    mocks.rpc.mockResolvedValue(result({email:null}));await mount();expect(screen.getByRole('button',{name:'Enable my alerts'})).toBeDisabled();
  });
  it('waits for matching acknowledgement; double clicks make only one opt-in call',async()=>{
    const view=await mount();let finish!:(x:unknown)=>void;
    mocks.rpc.mockImplementation((name:string)=>name==='set_owner_alert_preference_v1'?new Promise(resolve=>{finish=resolve;}):result({enabled:true}));
    fireEvent.click(screen.getByRole('button',{name:'Enable my alerts'}));fireEvent.click(screen.getByRole('button',{name:'Enable my alerts'}));await flush();
    expect(screen.getByText('Preference: Off')).toBeInTheDocument();expect(screen.queryByText(/Preference saved/)).not.toBeInTheDocument();
    expect(mocks.rpc.mock.calls.filter(c=>c[0]==='set_owner_alert_preference_v1')).toEqual([['set_owner_alert_preference_v1',{p_enabled:true,p_account_id:'account-a'}]]);
    finish({data:{enabled:true,accountId:'account-a'},error:null});await flush();
    expect(screen.getByText('Preference: On')).toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('Only new feedback');
    expect(view.client.getQueryData(['owner-alerts','owner-a'])).toMatchObject({enabled:true});
  });
  it.each([{data:null,error:null},{data:{enabled:true,accountId:'foreign'},error:null},{data:{enabled:false,accountId:'account-a'},error:null},{data:null,error:{message:'offline'}}])('does not claim preference success for unconfirmed save: %j',async ack=>{
    await mount();mocks.rpc.mockResolvedValue(ack);fireEvent.click(screen.getByRole('button',{name:'Enable my alerts'}));await flush();
    expect(screen.getByText('Preference: Off')).toBeInTheDocument();expect(screen.getByText(/change could not be confirmed/)).toBeInTheDocument();expect(screen.queryByText(/Preference saved/)).not.toBeInTheDocument();
  });
  it('explains in-flight mail after confirmed opt-out',async()=>{
    mocks.rpc.mockResolvedValue(result({enabled:true}));await mount();
    mocks.rpc.mockImplementation(name=>name==='set_owner_alert_preference_v1'?{data:{enabled:false,accountId:'account-a'},error:null}:result());
    fireEvent.click(screen.getByRole('button',{name:'Turn off my alerts'}));await flush();expect(screen.getByRole('status')).toHaveTextContent('already in flight may still arrive');
  });
  it('labels provider acceptance honestly and exposes held/failed statuses',async()=>{
    mocks.rpc.mockResolvedValue(result({attentionCount:2,worker:{state:'ready',checkedAt:'2026-09-15T10:00:00Z'},recent:[
      {id:'a',property:'House',createdAt:'2026-09-15T09:58:00Z',status:'accepted',reason:null},
      {id:'b',property:'House',createdAt:'2026-09-15T09:59:00Z',status:'uncertain',reason:'transport_interrupted'},
      {id:'c',property:'House',createdAt:'2026-09-15T10:00:00Z',status:'failed',reason:'daily_limit'},
    ]}));await mount();fireEvent.click(screen.getByText(/Alert settings/, {selector:'summary'}));fireEvent.click(screen.getByText('Latest 3 alert attempts'));
    expect(screen.getByText('Accepted by email provider — delivery unverified')).toBeVisible();expect(screen.getByText(/held to prevent duplicate/)).toBeVisible();
    expect(screen.getByText(/50 attempts per owner/)).toBeVisible();expect(screen.getByRole('alert')).toHaveTextContent('2 alert(s)');
  });
  it('uses conditional polling, pauses in background and refreshes on focus',async()=>{
    await mount();mocks.rpc.mockResolvedValue({data:{version:'v1',data:null},error:null});await flush(30_000);
    expect(mocks.rpc).toHaveBeenLastCalledWith('get_owner_alert_status_v1',{p_known_version:'v1'});
    const before=mocks.rpc.mock.calls.length;act(()=>focusManager.setFocused(false));await flush(60_000);expect(mocks.rpc).toHaveBeenCalledTimes(before);
    act(()=>focusManager.setFocused(true));await flush();expect(mocks.rpc).toHaveBeenCalledTimes(before+1);
  });
  it('does not turn an unknown status or broken connection into a successful/off state',async()=>{
    mocks.rpc.mockResolvedValue({data:{version:'v-bad',data:null},error:null});await mount();
    expect(screen.getByText(/Could not check owner alerts/)).toBeInTheDocument();expect(screen.queryByText('Preference: Off')).not.toBeInTheDocument();
  });
  it('purges private status on access denial and logout',async()=>{
    const view=await mount();mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}});await flush(30_000);
    expect(screen.queryByText('owner@example.invalid')).not.toBeInTheDocument();expect(screen.getByText(/Owner account access is unavailable/)).toBeInTheDocument();
    mocks.user=null;view.rerender(view.content());await flush();expect(screen.queryByText('Owner email alerts')).not.toBeInTheDocument();
  });
  it('does not show a previous owner’s late query after switching users',async()=>{
    let finish!:(x:unknown)=>void;mocks.rpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const view=await mount();
    mocks.user='owner-b';mocks.rpc.mockResolvedValue(result({email:'second@example.invalid',accountId:'account-b'}));view.rerender(view.content());await flush();
    finish(result());await flush();expect(mocks.signals[0].aborted).toBe(true);expect(screen.queryByText('owner@example.invalid')).not.toBeInTheDocument();expect(screen.getByText('second@example.invalid')).toBeInTheDocument();
  });
  it('does not recreate cleared private cache from a late preference save after logout',async()=>{
    const view=await mount();let finish!:(x:unknown)=>void;
    mocks.rpc.mockImplementation(name=>name==='set_owner_alert_preference_v1'?new Promise(resolve=>{finish=resolve;}):result());
    fireEvent.click(screen.getByRole('button',{name:'Enable my alerts'}));await flush();
    mocks.user=null;view.rerender(view.content());await flush();view.client.clear();
    finish({data:{enabled:true,accountId:'account-a'},error:null});await flush();
    expect(view.client.getQueryData(['owner-alerts','owner-a'])).toBeUndefined();expect(screen.queryByText('Owner email alerts')).not.toBeInTheDocument();
  });
});
