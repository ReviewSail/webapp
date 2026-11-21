import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FeedbackGate from './FeedbackGate';
import Feedback from './Feedback';
import { QueryWrapper } from '../test/queryWrapper';
import { encodeShortId } from '../lib/shortLink';

const LOCATION_ID = 'a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7';
const REQUEST_ID = 'b1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7';
const CODE = encodeShortId(LOCATION_ID)!;
const rpc = vi.fn();
vi.mock('../integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
const settled = (value: unknown) => Object.assign(Promise.resolve(value), { maybeSingle: () => Promise.resolve(value) });
const metadata = { location_id: LOCATION_ID, location_name: 'Sea View House',
  google_place_url: 'https://g.page/sea-view/review', recovery_email: 'owner@example.invalid' };
const renderGate = (path = '/p/' + CODE) => render(
  <QueryWrapper><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/p/:code" element={<FeedbackGate mode="property" />} />
    <Route path="/r/:code" element={<FeedbackGate />} />
    <Route path="/feedback-gate" element={<FeedbackGate />} />
    <Route path="/feedback" element={<Feedback />} />
  </Routes></MemoryRouter></QueryWrapper>,
);
const saves = () => rpc.mock.calls.filter(call => call[0] === 'submit_guest_feedback_v2');
const choose = (star = 2) => fireEvent.click(screen.getByRole('button', { name: 'Rate ' + star + ' star' + (star === 1 ? '' : 's') }));
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Save private feedback' }));
const reply = (status: string) => (_name: string, args: { p_submission_id: string }) =>
  settled({ data: { status, submission_id: args.p_submission_id }, error: null });

beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockImplementation((name: string, args: { p_submission_id: string }) =>
    name === 'get_guest_feedback_context_v2'
      ? settled({ data: metadata, error: null })
      : reply('accepted')(name, args));
});

describe('public feedback journeys', () => {
  it('loads property context without reading or mutating a request', async () => {
    renderGate(); await screen.findByText('Sea View House');
    expect(rpc).toHaveBeenCalledWith('get_guest_feedback_context_v2', { p_mode: 'property', p_target_id: LOCATION_ID });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['/feedback-gate?request_id=' + REQUEST_ID, '/feedback?request_id=' + REQUEST_ID, '/r/' + encodeShortId(REQUEST_ID)])(
    'uses the same durable request flow at %s', async path => {
      renderGate(path); await screen.findByText('Sea View House'); choose(4); submit();
      await screen.findByText('Feedback saved');
      expect(saves()[0][1]).toMatchObject({ p_mode: 'request', p_target_id: REQUEST_ID, p_star_rating: 4 });
    });

  it.each([1, 2, 3, 4, 5])('offers an identical independent public review link before/after rating %i and after saving', async star => {
    renderGate(); await screen.findByText('Sea View House');
    const link = screen.getByRole('link', { name: 'Write a Google review' });
    expect(link).toHaveAttribute('href', metadata.google_place_url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    choose(star);
    expect(saves()).toHaveLength(0); // Rating selection neither saves nor redirects.
    expect(screen.getByRole('link', { name: 'Write a Google review' })).toBe(link);
    submit(); await screen.findByText('Feedback saved');
    expect(screen.getByRole('link', { name: 'Write a Google review' })).toBe(link);
    expect(saves()[0][1]).toMatchObject({ p_star_rating: star, p_feedback_text: null });
  });

  it('never shows saved before the server acknowledgement and ignores double-submit', async () => {
    renderGate(); await screen.findByText('Sea View House');
    let resolve!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    choose(5);
    const button = screen.getByRole('button', { name: 'Save private feedback' });
    fireEvent.click(button); fireEvent.click(button);
    expect(saves()).toHaveLength(1);
    expect(screen.queryByText('Feedback saved')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    const id = saves()[0][1].p_submission_id;
    resolve({ data: { status: 'accepted', submission_id: id }, error: null });
    await screen.findByText('Feedback saved');
  });

  it('preserves text after a lost acknowledgement and retries the identical key and payload', async () => {
    renderGate(); await screen.findByText('Sea View House'); choose();
    fireEvent.change(screen.getByLabelText('Your message (optional)'), { target: { value: 'The heater was broken.' } });
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'guest@example.invalid' } });
    rpc.mockRejectedValueOnce(new Error('Network interrupted')); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not confirm');
    const field = screen.getByLabelText('Your message (optional)');
    expect(field).toHaveValue('The heater was broken.');
    expect(field).toHaveAttribute('readonly');
    expect(screen.queryByText('Feedback saved')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Write a Google review' })).toBeInTheDocument();
    rpc.mockImplementationOnce(reply('duplicate'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry same submission' }));
    await screen.findByText('Feedback saved');
    expect(saves()[1][1]).toEqual(saves()[0][1]);
  });

  it.each(['invalid', 'unavailable', 'rate_limited', 'conflict'])('keeps the form visible for explicit %s responses', async status => {
    renderGate(); await screen.findByText('Sea View House'); choose();
    fireEvent.change(screen.getByLabelText('Your message (optional)'), { target: { value: 'Keep this draft' } });
    rpc.mockImplementationOnce(reply(status)); submit();
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Your message (optional)')).toHaveValue('Keep this draft');
    expect(screen.queryByText('Feedback saved')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Write a Google review' })).toBeInTheDocument();
  });

  it.each([null, {}, { status: 'accepted', submission_id: 'wrong' }])('does not claim saved on malformed acknowledgement %j', async data => {
    renderGate(); await screen.findByText('Sea View House'); choose();
    rpc.mockResolvedValueOnce({ data, error: null }); submit();
    expect(await screen.findByRole('button', { name: 'Retry same submission' })).toBeEnabled();
    expect(screen.queryByText('Feedback saved')).not.toBeInTheDocument();
  });

  it('saves a distinct follow-up with a new key and no star rating, including without a recovery email', async () => {
    rpc.mockReturnValueOnce(settled({ data: { ...metadata, recovery_email: null }, error: null }));
    renderGate(); await screen.findByText('Sea View House'); choose(); submit();
    await screen.findByText('Feedback saved');
    fireEvent.change(screen.getByLabelText('Follow-up message'), { target: { value: 'One more detail' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    await screen.findByText(/Follow-up saved for the property/);
    expect(saves()).toHaveLength(2);
    expect(saves()[1][1]).toMatchObject({ p_star_rating: null, p_feedback_text: 'One more detail' });
    expect(saves()[1][1].p_submission_id).not.toBe(saves()[0][1].p_submission_id);
    expect(screen.queryByText(/delivered to the hotel/)).not.toBeInTheDocument();
  });

  it('a follow-up failure preserves both earlier success and the follow-up draft', async () => {
    renderGate(); await screen.findByText('Sea View House'); choose(); submit();
    await screen.findByText('Feedback saved');
    fireEvent.change(screen.getByLabelText('Follow-up message'), { target: { value: 'Keep follow-up text' } });
    rpc.mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Save follow-up' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Feedback saved')).toBeInTheDocument();
    expect(screen.getByLabelText('Follow-up message')).toHaveValue('Keep follow-up text');
    expect(screen.queryByText(/Follow-up saved for the property/)).not.toBeInTheDocument();
  });

  it('handles missing and malformed links without a database call', async () => {
    renderGate('/p/not-valid');
    expect(await screen.findByText('This link is not valid.')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not offer a form for an expired/unavailable request', async () => {
    rpc.mockReturnValueOnce(settled({ data: null, error: null }));
    renderGate('/feedback?request_id=' + REQUEST_ID);
    expect(await screen.findByRole('alert')).toHaveTextContent('unavailable or expired');
    expect(screen.queryByRole('button', { name: 'Save private feedback' })).not.toBeInTheDocument();
  });
  it('allows retrying a failed metadata read', async () => {
    rpc.mockReturnValueOnce(settled({ data: null, error: { message: 'Offline' } }));
    renderGate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
    fireEvent.click(screen.getByRole('button', { name: 'Try loading again' }));
    await screen.findByText('Sea View House');
  });
  it('does not render unsafe URLs as public links', async () => {
    rpc.mockReturnValueOnce(settled({ data: { ...metadata, google_place_url: 'javascript:alert(1)' }, error: null }));
    renderGate(); await screen.findByText('Sea View House');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('demo mode makes no database writes and labels simulation honestly', async () => {
    renderGate('/feedback-gate?request_id=demo'); await screen.findByText('The Grand Hotel'); choose(); submit();
    await screen.findByText('Preview complete');
    expect(rpc).not.toHaveBeenCalled();
  });
});
