import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import SettingsPage from './Settings';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ role: 'admin', session: { user: { email: 'admin@example.invalid' } } }) }));
vi.mock('../context/ReviewSailContext', () => ({ useReviewSail: () => ({
  locations: [], orders: [], customers: [], reviewRequests: [], feedbacks: [], activeLocationId: null, digestSetting: null,
}) }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ toast: { error: vi.fn() } }) }));
vi.mock('../components/settings/AppearanceSettings', () => ({ AppearanceSettings: () => null }));

it('explains the deletion hold without offering a destructive confirmation or calling the API', () => {
  render(<MemoryRouter initialEntries={['/settings?tab=account']}><SettingsPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Account deletion temporarily paused' })).toBeInTheDocument();
  expect(screen.getByText(/Your data and subscription have not been changed/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete Account' })).not.toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});
