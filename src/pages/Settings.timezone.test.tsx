import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import SettingsPage from './Settings';
import { TIMEZONES } from '../lib/timezones';
const fixture = vi.hoisted(() => ({ state: {} as any, save: vi.fn() }));
vi.mock('../integrations/supabase/client', () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ role: 'admin', session: { user: { email: 'admin@example.invalid' } } }) }));
vi.mock('../context/ReviewSailContext', () => ({ useReviewSail: () => fixture.state }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../components/settings/AppearanceSettings', () => ({ AppearanceSettings: () => null }));
beforeEach(() => {
  fixture.save.mockReset().mockResolvedValue(undefined);
  fixture.state = { locations: [{ id: 'a', name: 'Test property', timezone: 'UTC', googlePlaceUrl: '', preferredSendHour: 10 }], activeLocationId: 'a', orders: [], customers: [], reviewRequests: [], feedbacks: [], digestSetting: null, updateLocationSettings: fixture.save };
});
it('always offers UTC alongside the runtime timezone list', () => {
  expect(TIMEZONES).toContain('UTC');
  expect(TIMEZONES.filter(zone => zone === 'UTC')).toHaveLength(1);
});
it.each(['UTC', 'US/Eastern'])('displays and saves the actual stored timezone %s', async timezone => {
  fixture.state.locations[0].timezone = timezone;
  render(<MemoryRouter><SettingsPage /></MemoryRouter>);
  expect(screen.getByLabelText('Property Timezone')).toHaveValue(timezone);
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
  await waitFor(() => expect(fixture.save).toHaveBeenCalledWith('a', expect.objectContaining({ timezone })));
});
it('updates the displayed timezone when the selected property changes', async () => {
  const view = render(<MemoryRouter><SettingsPage /></MemoryRouter>);
  fixture.state = { ...fixture.state, activeLocationId: 'b', locations: [...fixture.state.locations, { id: 'b', name: 'Second property', timezone: 'US/Pacific' }] };
  view.rerender(<MemoryRouter><SettingsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByLabelText('Property Timezone')).toHaveValue('US/Pacific'));
});
