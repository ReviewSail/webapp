import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FeedbackGate from './FeedbackGate';
import { encodeShortId } from '../lib/shortLink';

/**
 * The property-QR path: a guest scans a poster, so no stay was ever imported.
 * These assert the two things that distinguish it from the emailed gate —
 * it keys off a location, and it must never touch request-scoped RPCs.
 */

const LOCATION_ID = 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7';
const CODE = encodeShortId(LOCATION_ID)!;

const rpc = vi.fn();

vi.mock('../integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

/** supabase-js builders are thenables that also expose .maybeSingle(). */
const settled = (value: unknown) =>
  Object.assign(Promise.resolve(value), { maybeSingle: () => Promise.resolve(value) });

const renderGate = (code = CODE) =>
  render(
    <MemoryRouter initialEntries={[`/p/${code}`]}>
      <Routes>
        <Route path="/p/:code" element={<FeedbackGate mode="property" />} />
      </Routes>
    </MemoryRouter>,
  );

const rpcNames = () => rpc.mock.calls.map(c => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockImplementation((name: string) => {
    if (name === 'get_property_gate_context') {
      return settled({
        data: {
          location_id: LOCATION_ID,
          location_name: 'Sea View Hotel',
          google_place_url: 'https://g.page/sea-view/review',
          recovery_email: 'owner@seaview.example',
        },
        error: null,
      });
    }
    return settled({ error: null });
  });

  // jsdom won't navigate; capture the redirect instead of attempting it.
  Object.defineProperty(window, 'location', {
    value: { href: '', origin: 'http://localhost' },
    writable: true,
    configurable: true,
  });
});

describe('the property gate', () => {
  it('resolves the property from the code in the URL', async () => {
    renderGate();
    expect(await screen.findByText(/Sea View Hotel/)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('get_property_gate_context', { p_location_id: LOCATION_ID });
  });

  it('never calls the request-scoped context RPC', async () => {
    renderGate();
    await screen.findByText(/Sea View Hotel/);
    expect(rpcNames()).not.toContain('get_feedback_gate_context');
  });

  it('does not try to record a click — there is no request yet', async () => {
    renderGate();
    await screen.findByText(/Sea View Hotel/);
    expect(rpcNames()).not.toContain('record_request_event');
  });

  it('records a high rating and hands the guest to Google', async () => {
    renderGate();
    await screen.findByText(/Sea View Hotel/);

    fireEvent.click(screen.getAllByRole('button', { name: /5 star/i })[0]);

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'submit_property_feedback',
        expect.objectContaining({ p_location_id: LOCATION_ID, p_star_rating: 5 }),
      ),
    );
    await waitFor(() => expect(window.location.href).toBe('https://g.page/sea-view/review'));
  });

  it('keeps an unhappy guest on the page for private feedback', async () => {
    renderGate();
    await screen.findByText(/Sea View Hotel/);

    fireEvent.click(screen.getAllByRole('button', { name: /2 star/i })[0]);

    // No redirect, and nothing submitted until they actually write something.
    expect(window.location.href).toBe('');
    expect(rpcNames()).not.toContain('submit_property_feedback');
  });

  it('rejects a code that is not a valid id', async () => {
    renderGate('not-a-real-code');
    expect(await screen.findByText(/not valid/i)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});
