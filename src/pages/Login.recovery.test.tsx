import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ session: null, loading: false }) }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ resolved: 'light' }) }));
vi.mock('../integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@supabase/auth-ui-react', () => ({ Auth: (props: { view: string; redirectTo: string; showLinks: boolean }) =>
  <div data-testid="auth" data-view={props.view} data-redirect={props.redirectTo} data-links={String(props.showLinks)}>Isolated auth</div> }));
afterEach(cleanup);

it.each(['', '?next=inbox', '?next=https://evil.invalid'])('separates signup from recovery and constrains return destinations (%s)', search => {
  render(<MemoryRouter initialEntries={['/login' + search]}><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/reset-password" element={<p>Recovery request destination</p>} />
  </Routes></MemoryRouter>);
  const expectedRedirect = window.location.origin + '/login' + (search === '?next=inbox' ? search : '');
  expect(screen.getByTestId('auth')).toHaveAttribute('data-redirect', expectedRedirect);
  expect(screen.getByTestId('auth')).toHaveAttribute('data-links', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  expect(screen.getByTestId('auth')).toHaveAttribute('data-view', 'sign_up');
  expect(screen.getByTestId('auth')).toHaveAttribute('data-redirect', expectedRedirect);
  fireEvent.click(screen.getByRole('button', { name: 'Already have an account? Sign in' }));
  expect(screen.getByTestId('auth')).toHaveAttribute('data-view', 'sign_in');
  fireEvent.click(screen.getByRole('link', { name: 'Forgot your password?' }));
  expect(screen.getByText('Recovery request destination')).toBeInTheDocument();
});
