import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { OnboardingWizard } from './OnboardingWizard';
import type { Location } from '../../context/ReviewSailContext';
const mock = vi.hoisted(() => ({ state: {} as any, role: 'admin', update: vi.fn(), complete: vi.fn() }));
vi.mock('../../context/ReviewSailContext', () => ({ useReviewSail: () => ({ ...mock.state, updateLocationSettings: mock.update, completeOnboarding: mock.complete }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ role: mock.role }) }));
const property: Location = { id: 'a', name: 'Main Location', timezone: 'America/Los_Angeles', googlePlaceUrl: '', onboardingComplete: false, preferredSendHour: 10, enableEmail: true, enableSms: false, midstayEnabled: false, midstayDay: 2, recoveryEmail: '' };
function Path() { return <output>{useLocation().pathname}</output>; }
const content = () => <MemoryRouter initialEntries={['/dashboard']}><OnboardingWizard /><Path /></MemoryRouter>;
beforeEach(() => { localStorage.clear(); mock.role = 'admin'; mock.state = { activeLocationId: 'a', locations: [{ ...property }] }; mock.update.mockReset().mockResolvedValue(undefined); mock.complete.mockReset().mockResolvedValue(undefined); });

describe('property setup', () => {
  it('saves the persisted timezone and resumes after a reload', async () => {
    const view = render(content());
    expect(screen.getByRole('button', { name: /Change property timezone/ })).toHaveTextContent('Pacific Time');
    fireEvent.change(screen.getByLabelText('Property name'), { target: { value: 'Harbour Inn' } });
    fireEvent.change(screen.getByLabelText('Host contact email'), {target:{value:'host@example.com'}});
    fireEvent.click(screen.getByRole('button', { name: 'Continue to guest link' }));
    await screen.findByRole('heading', { name: 'Share your guest help link' });
    expect(mock.update).toHaveBeenCalledWith('a', { name: 'Harbour Inn', timezone: 'America/Los_Angeles', usualArrival:'16:00', recoveryEmail:'host@example.com' });
    view.unmount(); mock.state.locations[0].name = 'Harbour Inn'; render(content());
    expect(screen.getByLabelText('Google review link (optional)')).toBeVisible();
  });
  it('discards form values when switching properties', () => {
    const view = render(content());
    fireEvent.change(screen.getByLabelText('Property name'), { target: { value: 'Unsaved A' } });
    mock.state = { activeLocationId: 'b', locations: [{ ...property, id: 'b', timezone: 'Europe/London' }] };
    view.rerender(content());
    expect(screen.getByLabelText('Property name')).toHaveValue('');
    expect(screen.getByRole('button', { name: /Change property timezone/ })).toHaveTextContent('London');
  });
  it('rejects an invalid link without writing it', async () => {
    mock.state.locations[0].name = 'Harbour Inn'; render(content());
    fireEvent.change(screen.getByLabelText('Google review link (optional)'), { target: { value: 'not a link' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid Google review link');
    expect(mock.update).not.toHaveBeenCalled();
  });
  it('shows final-step errors and lets the user retry', async () => {
    mock.state.locations[0] = { ...property, name: 'Harbour Inn', googlePlaceUrl: 'https://g.page/r/example/review' };
    mock.complete.mockRejectedValueOnce(new Error('Connection failed. Try again.'));
    render(content()); fireEvent.click(screen.getByRole('button', { name: 'Finish and add guests' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection failed');
    fireEvent.click(screen.getByRole('button', { name: 'Finish and add guests' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('/import'));
  });
  it('navigates after the completed form disappears during cache refresh', async () => {
    mock.state.locations[0] = { ...property, name: 'Harbour Inn', googlePlaceUrl: 'https://g.page/r/example/review' };
    let resolve!: () => void; mock.complete.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const view = render(content()); fireEvent.click(screen.getByRole('button', { name: 'Finish and add guests' }));
    mock.state.locations[0].onboardingComplete = true; view.rerender(content());
    await act(async () => { resolve(); });
    expect(screen.getByRole('status')).toHaveTextContent('/import');
  });
  it('does not navigate to import for a different property after a pending completion', async () => {
    mock.state.locations[0] = { ...property, name: 'Harbour Inn', googlePlaceUrl: 'https://g.page/r/example/review' };
    let resolve!: () => void; mock.complete.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    const view = render(content()); fireEvent.click(screen.getByRole('button', { name: 'Finish and add guests' }));
    mock.state = { activeLocationId: 'b', locations: [{ ...property, id: 'b' }] }; view.rerender(content());
    await act(async () => { resolve(); });
    expect(screen.getByRole('status')).toHaveTextContent('/dashboard');
    expect(screen.getByLabelText('Property name')).toHaveValue('');
  });
  it('does not offer staff a form they cannot save', () => {
    mock.role = 'staff'; render(content());
    expect(screen.queryByLabelText('Property name')).not.toBeInTheDocument();
    expect(screen.getByText(/administrator needs to finish/)).toBeVisible();
  });
});
