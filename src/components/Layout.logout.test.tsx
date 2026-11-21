import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Layout } from './Layout';
const mock = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { auth: { signOut: mock.signOut } } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'a', email: 'a@example.invalid' }, role: 'admin' }) }));
vi.mock('../context/ReviewSailContext', () => ({ useReviewSail: () => ({ locations: [], activeLocationId: null, setActiveLocationId: vi.fn() }) }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@radix-ui/react-dropdown-menu', () => {
  const Pass = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { Root: Pass, Trigger: Pass, Portal: Pass, Content: Pass, Item: ({ children, onSelect, disabled }: { children: ReactNode; onSelect: () => void; disabled: boolean }) => <button onClick={onSelect} disabled={disabled}>{children}</button> };
});
vi.mock('@radix-ui/react-dialog', () => {
  const Pass = ({ children }: { children: ReactNode }) => <>{children}</>;
  return { Root: Pass, Trigger: Pass, Portal: Pass, Overlay: () => null, Content: Pass, Title: Pass, Close: Pass };
});
beforeEach(() => { mock.signOut.mockReset().mockResolvedValue({ error: null }); });
afterEach(cleanup);
it.each([false, true])('reports sign-out failure (thrown=%s) and allows retry', async thrown => {
  if (thrown) mock.signOut.mockRejectedValueOnce(new Error('network'));
  else mock.signOut.mockResolvedValueOnce({ error: { message: 'network' } });
  render(<MemoryRouter><Layout /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('browser may still be signed in');
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('button', { name: 'Sign out' })).not.toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(mock.signOut).toHaveBeenCalledTimes(2);
});
it('disables repeated clicks while sign-out is pending', () => {
  mock.signOut.mockReturnValue(new Promise(() => {})); render(<MemoryRouter><Layout /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Signing out…' })); expect(mock.signOut).toHaveBeenCalledOnce();
});
