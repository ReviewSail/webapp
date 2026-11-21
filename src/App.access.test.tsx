import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, AdminRoute } from './App';

const mock = vi.hoisted(() => ({ auth: { session: { user: { id: 'a' } } as { user: { id: string } } | null,
  role: 'admin' as string | null, loading: false, error: null as Error | null, accountId: 'account-a', scopeVersion: 1, refreshIdentity: vi.fn() } }));
vi.mock('./context/AuthContext', () => ({ useAuth: () => mock.auth, AuthProvider: () => null }));
vi.mock('./integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('./integrations/supabase/passwordRecovery', () => ({ passwordRecovery: {} }));
afterEach(cleanup);
beforeEach(() => { Object.assign(mock.auth, { session: { user: { id: 'a' } }, role: 'admin', loading: false, error: null, accountId: 'account-a', scopeVersion: 1 }); mock.auth.refreshIdentity.mockResolvedValue(undefined); });
function Draft() { const [text, setText] = useState(''); return <input aria-label="Private draft" value={text} onChange={event => setText(event.target.value)} />; }
function tree(admin = false) { return <MemoryRouter initialEntries={['/inbox']}><Routes>
  <Route path="/inbox" element={<ProtectedRoute>{admin ? <AdminRoute><Draft /></AdminRoute> : <Draft />}</ProtectedRoute>} />
  <Route path="/login" element={<p>Sign in</p>} /><Route path="/dashboard" element={<p>Dashboard</p>} />
</Routes></MemoryRouter>; }
it.each(['staff', null, 'unexpected'])('requires positive admin permission, rejecting %s', role => {
  mock.auth.role = role; render(tree(true)); expect(screen.getByText('Dashboard')).toBeInTheDocument(); expect(screen.queryByLabelText('Private draft')).not.toBeInTheDocument();
});
it('allows a verified admin', () => { render(tree(true)); expect(screen.getByLabelText('Private draft')).toBeInTheDocument(); });
it('hides private content while access is unknown and after logout', () => {
  mock.auth.loading = true; const view = render(tree()); expect(screen.queryByLabelText('Private draft')).not.toBeInTheDocument();
  mock.auth.loading = false; mock.auth.session = null; view.rerender(tree()); expect(screen.getByText('Sign in')).toBeInTheDocument();
});
it('offers retry without exposing cached content on identity failure', () => {
  mock.auth.error = new Error('offline'); render(tree()); expect(screen.getByRole('alert')).toHaveTextContent('private data is hidden');
  fireEvent.click(screen.getByRole('button', { name: 'Retry account access' })); expect(mock.auth.refreshIdentity).toHaveBeenCalled();
  expect(screen.queryByLabelText('Private draft')).not.toBeInTheDocument();
});
it.each(['other-user', 'same-user-team'])('resets private drafts without needing an intermediate loading render (%s)', change => {
  const view = render(tree()); fireEvent.change(screen.getByLabelText('Private draft'), { target: { value: 'Previous account draft' } });
  if (change === 'other-user') mock.auth.session = { user: { id: 'b' } };
  mock.auth.accountId = 'account-b'; mock.auth.scopeVersion++; view.rerender(tree());
  expect(screen.getByLabelText('Private draft')).toHaveValue('');
});
