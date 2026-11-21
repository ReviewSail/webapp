import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AcceptInvite from './AcceptInvite';
const mock = vi.hoisted(() => ({ userId: 'a', rpc: vi.fn(), refreshIdentity: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: mock.userId }, session: { user: { id: mock.userId } }, loading: false, refreshIdentity: mock.refreshIdentity }) }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { rpc: mock.rpc } }));
vi.mock('@supabase/auth-ui-react', () => ({ Auth: () => null }));
beforeEach(() => { mock.userId = 'a'; mock.rpc.mockReset().mockResolvedValue({ error: null }); mock.refreshIdentity.mockReset().mockResolvedValue(undefined); });
afterEach(cleanup);
function tree() { return <StrictMode><MemoryRouter initialEntries={['/accept-invite?token=synthetic-invite']}><Routes>
  <Route path="/accept-invite" element={<AcceptInvite />} /><Route path="/dashboard" element={<p>Dashboard</p>} />
</Routes></MemoryRouter></StrictMode>; }
it('refreshes identity before success and redeems only once under StrictMode', async () => {
  let resolve!: () => void; mock.refreshIdentity.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  render(tree()); await waitFor(() => expect(mock.refreshIdentity).toHaveBeenCalledOnce());
  expect(screen.queryByText("You're on the team")).not.toBeInTheDocument();
  await act(async () => resolve()); expect(screen.getByText("You're on the team")).toBeInTheDocument();
  expect(mock.rpc).toHaveBeenCalledOnce(); expect(mock.rpc).toHaveBeenCalledWith('accept_invitation', { p_token: 'synthetic-invite' });
});
it('reports a refresh failure without claiming full access', async () => {
  mock.refreshIdentity.mockRejectedValue(new Error('offline')); render(tree());
  expect(await screen.findByText(/account access could not be refreshed/)).toBeInTheDocument(); expect(screen.queryByText("You're on the team")).not.toBeInTheDocument();
});
it('does not refresh a new user because the old user’s request completed late', async () => {
  let resolve!: (result: unknown) => void; mock.rpc.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValue({ error: { message: 'invite_email_mismatch' } });
  const view = render(tree()); mock.userId = 'b'; view.rerender(tree());
  expect(await screen.findByText('Invite not accepted')).toBeInTheDocument();
  await act(async () => resolve({ error: null })); expect(mock.refreshIdentity).not.toHaveBeenCalled();
});
