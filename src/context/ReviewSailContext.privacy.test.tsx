import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '../test/queryWrapper';
import { ReviewSailProvider, useReviewSail } from './ReviewSailContext';

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
  deletes: [] as string[],
  orderError: false,
  writes: [] as Array<{ table: string; rows: Record<string, unknown>[] }>,
  requestError: null as { message: string } | null,
}));
vi.mock('../integrations/supabase/client', () => ({ supabase: { from: mock.from, rpc: mock.rpc, functions: { invoke: mock.invoke } } }));
vi.mock('./AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-a', email: 'owner@example.invalid' } } }),
}));

beforeEach(() => {
  mock.from.mockReset();
  mock.invoke.mockReset();
  mock.rpc.mockReset();
  mock.rpc.mockResolvedValue({ data: [{ index: 0, status: 'imported' }], error: null });
  mock.deletes = [];
  mock.orderError = false;
  mock.writes = [];
  mock.requestError = null;
  mock.from.mockImplementation((table: string) => {
    let rows: Record<string, unknown>[] | null = null;
    let single = false;
    const result = () => {
      // Simulate the locked-down API even if a future change reintroduces a read.
      if (table === 'opt_outs') return { data: null, error: { message: 'permission denied' } };
      if (rows) {
        if (table === 'orders' && mock.orderError) return { data: null, error: { message: 'Stay creation failed' } };
        if (table === 'review_requests' && mock.requestError) return { data: null, error: mock.requestError };
        const inserted = rows.map((row, i) => ({ ...row, id: `${table}-${i}` }));
        return { data: single ? inserted[0] : inserted, error: null };
      }
      if (table === 'users') return { data: { account_id: 'account-a' }, error: null };
      if (table === 'accounts') return { data: { subscription_status: 'active' }, error: null };
      if (table === 'locations') return { data: [{ id: 'loc-a', name: 'Test House', timezone: 'UTC' }], error: null };
      return { data: table === 'digest_settings' ? null : [], error: null };
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      range: () => builder,
      single: () => { single = true; return builder; },
      delete: () => { mock.deletes.push(table); return builder; },
      maybeSingle: () => builder,
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        rows = Array.isArray(payload) ? payload : [payload];
        mock.writes.push({ table, rows });
        return builder;
      },
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  });
});

const accepted = (id: string) => ({ success: true, results: [{ id, status: 'sent', channels: {
  email: { status: 'accepted', providerId: 'email-test' },
  sms: { status: 'skipped', reason: 'missing_destination' },
} }] });

describe('confirmed sending and test link retention', () => {
  it('a mock checkout URL cannot write billing state, even in development', async () => {
    window.history.replaceState({}, '', '/dashboard?mock_checkout_success=true&account_id=account-a');
    try {
      await loadedProvider();
      expect(mock.writes.filter(w => w.table === 'accounts')).toEqual([]);
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('subscribe reports the missing-Stripe explanation without claiming a purchase', async () => {
    const { result } = await loadedProvider();
    mock.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: "Payments aren't set up yet." })) } });
    await act(async () => {
      expect(await result.current.subscribe()).toEqual({ success: false, error: "Payments aren't set up yet." });
    });
  });

  it('subscribe rejects a fake successful checkout response', async () => {
    const { result } = await loadedProvider();
    mock.invoke.mockResolvedValue({ data: { isMock: true, url: '/dashboard?mock_checkout_success=true' }, error: null });
    await act(async () => { expect((await result.current.subscribe()).success).toBe(false); });
  });
  it('rejects a successful HTTP response that processed no request', async () => {
    const { result } = await loadedProvider();
    mock.invoke.mockResolvedValue({ data: { success: true, results: [], processed: 0 }, error: null });
    await act(async () => { expect((await result.current.triggerSingleResend('request-a')).success).toBe(false); });
  });

  it('rejects the old mock sent result without provider acceptance evidence', async () => {
    const { result } = await loadedProvider();
    mock.invoke.mockResolvedValue({ data: { success: true, results: [{ id: 'request-a', status: 'sent' }] }, error: null });
    await act(async () => { expect((await result.current.triggerSingleResend('request-a')).success).toBe(false); });
  });

  it('accepts the matching provider result without claiming delivery', async () => {
    const { result } = await loadedProvider();
    mock.invoke.mockResolvedValue({ data: accepted('request-a'), error: null });
    await act(async () => {
      const sent = await result.current.triggerSingleResend('request-a');
      expect(sent.success).toBe(true);
      expect(sent.message).toContain('Delivery is not yet confirmed');
    });
  });

  it('preserves the test guest and request after acceptance', async () => {
    const { result } = await loadedProvider();
    mock.invoke.mockResolvedValue({ data: accepted('review_requests-0'), error: null });
    await act(async () => { expect((await result.current.sendTestReviewRequest()).success).toBe(true); });
    expect(mock.deletes).toEqual([]);
    expect(mock.writes.find(w => w.table === 'orders')?.rows[0].source).toBe('reviewsail_test');
    expect(mock.writes.find(w => w.table === 'customers')?.rows[0].email).toBe('owner@example.invalid');
    expect(mock.invoke).toHaveBeenCalledWith('process-reviews', { body: { review_request_id: 'review_requests-0' } });
  });

  it('preserves test links when a network failure hides the send outcome', async () => {
    const { result } = await loadedProvider();
    mock.invoke.mockRejectedValue(new Error('Connection lost'));
    await act(async () => { expect((await result.current.sendTestReviewRequest()).success).toBe(false); });
    expect(mock.deletes).toEqual([]);
  });

  it('cleans up incomplete setup only before any send invocation', async () => {
    const { result } = await loadedProvider();
    mock.orderError = true;
    await act(async () => { expect((await result.current.sendTestReviewRequest()).success).toBe(false); });
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(mock.deletes).toEqual(['customers']);
  });

  it('shows the backend reason for a non-2xx response', async () => {
    const { result } = await loadedProvider();
    mock.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ error: 'Nothing was sent: this account needs an active plan.' }), { status: 409 }) } });
    await act(async () => { expect((await result.current.triggerSingleResend('request-a')).error).toContain('active plan'); });
  });
});

async function loadedProvider() {
  const client = createTestQueryClient();
  const hook = renderHook(() => useReviewSail(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <ReviewSailProvider>{children}</ReviewSailProvider>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { ...hook, client };
}

describe('internal note acknowledgement and cache', () => {
  it('patches only the matching feedback after confirmed storage without sending anything', async () => {
    const { result, client } = await loadedProvider();
    client.setQueryData(['reviewsail','guest_feedback','user-a'], [{id:'fb-a',managerResponse:null},{id:'fb-b',managerResponse:null}]);
    const invalidate = vi.spyOn(client,'invalidateQueries');
    const update = vi.fn().mockReturnValue({eq:()=>({select:()=>({maybeSingle:async()=>({data:{id:'fb-a',manager_response:'Check heater'},error:null})})})});
    mock.from.mockImplementation(()=>({update}));
    await act(async()=>{await result.current.saveFeedbackNote('fb-a',' Check heater ');});
    expect(client.getQueryData(['reviewsail','guest_feedback','user-a'])).toEqual([{id:'fb-a',managerResponse:'Check heater'},{id:'fb-b',managerResponse:null}]);
    expect(update).toHaveBeenCalledWith({manager_response:'Check heater'});
    expect(invalidate).not.toHaveBeenCalled(); expect(mock.invoke).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('does not patch a note into the cache when the database returns no affected row', async () => {
    const { result, client } = await loadedProvider();
    client.setQueryData(['reviewsail','guest_feedback','user-a'], [{id:'fb-a',managerResponse:null}]);
    mock.from.mockImplementation(()=>({update:()=>({eq:()=>({select:()=>({maybeSingle:async()=>({data:null,error:null})})})})}));
    await act(async()=>{await expect(result.current.saveFeedbackNote('fb-a','Check heater')).rejects.toThrow('could not confirm');});
    expect(client.getQueryData(['reviewsail','guest_feedback','user-a'])).toEqual([{id:'fb-a',managerResponse:null}]);
  });
});

describe('private suppression integration', () => {
  it('keeps committed totals and refreshes lists after a later unconfirmed batch', async () => {
    const { result, client } = await loadedProvider();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    mock.rpc.mockImplementationOnce(async (_name, { p_rows }) => ({ data: p_rows.map((_: unknown, index: number) => ({ index, status: 'imported' })), error: null }));
    mock.rpc.mockRejectedValueOnce(new Error('Interrupted'));
    await act(async () => {
      const imported = await result.current.bulkImport(Array.from({ length: 201 }, (_, i) => ({
        firstName: 'Synthetic', lastName: String(i), email: `${i}@example.invalid`, checkoutDate: '2026-09-13',
      })));
      expect(imported).toMatchObject({ imported: 200, unknown: 1, failed: 0 });
    });
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.writes).toEqual([]);
  });

  it('does not retarget later batches when the selected property changes mid-import', async () => {
    const { result } = await loadedProvider();
    let release!: (value: unknown) => void;
    mock.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    mock.rpc.mockResolvedValueOnce({ data: [{ index: 0, status: 'imported' }], error: null });
    let pending!: ReturnType<typeof result.current.bulkImport>;
    await act(async () => {
      pending = result.current.bulkImport(Array.from({ length: 201 }, (_, i) => ({
        firstName: 'Synthetic', lastName: String(i), email: `${i}@example.invalid`, checkoutDate: '2026-09-13',
      })));
      result.current.setActiveLocationId('loc-b');
    });
    await act(async () => {
      release({ data: Array.from({ length: 200 }, (_, index) => ({ index, status: 'imported' })), error: null });
      expect((await pending).imported).toBe(201);
    });
    expect(mock.rpc.mock.calls.map(call => call[1].p_location_id)).toEqual(['loc-a', 'loc-a']);
  });

  it('loads the real provider without requesting the global contact list', async () => {
    const { result } = await loadedProvider();
    expect(result.current.activeLocationId).toBe('loc-a');
    expect(mock.from).not.toHaveBeenCalledWith('opt_outs');
  });

  it('queues a manual request and lets the database apply suppression', async () => {
    const { result } = await loadedProvider();
    await act(async () => { await result.current.addReviewRequest('order-a'); });
    expect(mock.writes).toEqual([
      { table: 'review_requests', rows: [{ order_id: 'order-a', status: 'pending' }] },
    ]);
    expect(mock.from).not.toHaveBeenCalledWith('opt_outs');
  });

  it('does not silently swallow a rejected manual request', async () => {
    const { result } = await loadedProvider();
    mock.requestError = { message: 'Request stay is not accessible.' };
    await expect(result.current.addReviewRequest('foreign-order')).rejects.toEqual(mock.requestError);
  });

  it('imports guests and queues requests when client suppression access is denied', async () => {
    const { result } = await loadedProvider();
    await act(async () => {
      const imported = await result.current.bulkImport([{
        firstName: 'Synthetic', lastName: 'Guest', email: 'guest@example.invalid',
        checkoutDate: '2026-09-01', source: 'booking_com',
      }]);
      expect(imported).toEqual({ success: true, imported: 1, skippedDuplicates: 0, failed: 0, unknown: 0, notAttempted: 0, issues: [] });
    });
    expect(mock.rpc).toHaveBeenCalledWith('import_guest_batch', {
      p_location_id: 'loc-a', p_rows: [expect.objectContaining({ email: 'guest@example.invalid', source: 'booking_com' })],
    });
    expect(mock.writes).toEqual([]);
    expect(mock.from).not.toHaveBeenCalledWith('opt_outs');
  });
});
