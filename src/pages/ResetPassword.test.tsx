import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { RecoveryState } from '../lib/passwordRecovery';
import ResetPassword from './ResetPassword';

const mocks = vi.hoisted(() => ({
  state: { status: 'unavailable' } as RecoveryState,
  listeners: new Set<() => void>(),
  getUser: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), resetPasswordForEmail: vi.fn(),
}));
vi.mock('../integrations/supabase/client', () => ({ supabase: { auth: mocks } }));
vi.mock('../integrations/supabase/passwordRecovery', () => ({ passwordRecovery: {
  getSnapshot: () => mocks.state,
  subscribe: (fn: () => void) => { mocks.listeners.add(fn); return () => mocks.listeners.delete(fn); },
  clear: () => { mocks.state = { status: 'unavailable' }; mocks.listeners.forEach(fn => fn()); },
} }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = { status: 'ready', userId: 'owner-a', email: 'owner@example.invalid' };
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
  mocks.updateUser.mockResolvedValue({ data: { user: { id: 'owner-a' } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); mocks.listeners.clear(); vi.useRealTimers(); });
function show() {
  return render(<StrictMode><MemoryRouter initialEntries={['/reset-password']}><Routes>
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/login" element={<p>Sign-in destination</p>} />
  </Routes></MemoryRouter></StrictMode>);
}
function fill(password = 'A-new-password-123', confirmation = password) {
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: confirmation } });
}
function submit() { fireEvent.submit(screen.getByRole('button', { name: 'Update Password' }).closest('form')!); }

it('does not render or submit password fields until recovery is confirmed', () => {
  mocks.state = { status: 'checking' }; show();
  expect(screen.getByRole('status')).toHaveTextContent('Checking');
  expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument();
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
it('offers a fresh email link for invalid, expired, direct or reloaded visits, never sending on mount', () => {
  mocks.state = { status: 'unavailable' }; show();
  expect(screen.getByLabelText('Account email')).toBeInTheDocument();
  expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument();
  expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
});
it('sends to the dedicated recovery route with non-enumerating confirmation and no duplicate request', async () => {
  mocks.state = { status: 'unavailable' }; show();
  fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'owner@example.invalid' } });
  const form = screen.getByRole('button', { name: 'Send reset link' }).closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(await screen.findByRole('status')).toHaveTextContent('If an account exists');
  expect(mocks.resetPasswordForEmail).toHaveBeenCalledOnce();
  expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('owner@example.invalid', { redirectTo: window.location.origin + '/reset-password' });
});
it.each([false, true])('handles reset email failure (thrown=%s) without revealing provider details', async thrown => {
  mocks.state = { status: 'unavailable' };
  if (thrown) mocks.resetPasswordForEmail.mockRejectedValueOnce(new Error('private provider detail'));
  else mocks.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'private provider detail' } });
  show(); fireEvent.change(screen.getByLabelText('Account email'), { target: { value: 'owner@example.invalid' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not request');
  expect(screen.queryByText('private provider detail')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByRole('status')).toHaveTextContent('If an account exists');
});
it.each([['short', 'short', 'at least 6'], ['long-enough', 'different-value', 'do not match']])('validates passwords before calling auth', (password, confirmation, message) => {
  show(); fill(password, confirmation); submit();
  expect(screen.getByRole('alert')).toHaveTextContent(message); expect(mocks.updateUser).not.toHaveBeenCalled();
});
it('changes the verified recovery account once, then explicitly signs out before navigating', async () => {
  show(); fill(); const form = screen.getByRole('button', { name: 'Update Password' }).closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(await screen.findByText('Password Updated!')).toBeInTheDocument();
  expect(mocks.getUser).toHaveBeenCalledOnce();
  expect(mocks.updateUser).toHaveBeenCalledOnce();
  expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'A-new-password-123' });
  expect(mocks.signOut).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Return to sign in' }));
  expect(await screen.findByText('Sign-in destination')).toBeInTheDocument();
  expect(mocks.signOut).toHaveBeenCalledOnce();
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it.each([false, true])('blocks updates when recovery identity no longer matches (expired=%s)', async expired => {
  mocks.getUser.mockResolvedValue({ data: { user: expired ? null : { id: 'owner-b' } }, error: expired ? { message: 'expired' } : null });
  show(); fill(); submit();
  expect(await screen.findByLabelText('Account email')).toBeInTheDocument(); expect(mocks.updateUser).not.toHaveBeenCalled();
});
it('blocks an account-change event during the validation request', async () => {
  let resolve!: (value: unknown) => void;
  mocks.getUser.mockReturnValue(new Promise(done => { resolve = done; }));
  show(); fill(); submit();
  await act(async () => {
    mocks.state = { status: 'unavailable' }; mocks.listeners.forEach(fn => fn());
    resolve({ data: { user: { id: 'owner-a' } }, error: null });
  });
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
it('shows policy errors without success and allows correction', async () => {
  mocks.updateUser.mockResolvedValueOnce({ error: { code: 'weak_password' } });
  show(); fill(); submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('stronger password');
  expect(screen.queryByText('Password Updated!')).not.toBeInTheDocument();
  fill('Even-stronger-password-456'); submit();
  expect(await screen.findByText('Password Updated!')).toBeInTheDocument();
});
it('returns an expired update session to requesting a fresh link', async () => {
  mocks.updateUser.mockResolvedValue({ error: { status: 401 } }); show(); fill(); submit();
  expect(await screen.findByLabelText('Account email')).toBeInTheDocument();
});
it('keeps update network failures retryable without a false success', async () => {
  mocks.updateUser.mockRejectedValueOnce(new Error('network')); show(); fill(); submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm');
  submit(); expect(await screen.findByText('Password Updated!')).toBeInTheDocument();
});
it('does not treat an empty success response as a confirmed password change', async () => {
  mocks.updateUser.mockResolvedValue({ data: { user: null }, error: null }); show(); fill(); submit();
  expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm');
  expect(screen.queryByText('Password Updated!')).not.toBeInTheDocument();
});
it.each([false, true])('keeps password success distinct from sign-out failure (thrown=%s)', async thrown => {
  if (thrown) mocks.signOut.mockRejectedValueOnce(new Error('offline'));
  else mocks.signOut.mockResolvedValueOnce({ error: { message: 'offline' } });
  show(); fill(); submit(); await screen.findByText('Password Updated!');
  fireEvent.click(screen.getByRole('button', { name: 'Return to sign in' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('password was changed, but we could not sign you out');
  expect(screen.queryByText('Sign-in destination')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Return to sign in' }));
  expect(await screen.findByText('Sign-in destination')).toBeInTheDocument(); expect(mocks.updateUser).toHaveBeenCalledOnce();
});
it('provides accessible visibility controls and cleans up subscribers', () => {
  const view = show();
  expect(screen.getByLabelText('New Password')).toHaveAttribute('autocomplete', 'new-password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('New Password')).toHaveAttribute('type', 'text');
  expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  expect(mocks.listeners.size).toBe(1); view.unmount(); expect(mocks.listeners.size).toBe(0);
});
