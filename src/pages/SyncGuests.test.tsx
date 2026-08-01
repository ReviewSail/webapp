import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SyncGuests from './SyncGuests';

/**
 * Covers the manual "Add Guest" path and the template download. The page is
 * behind auth in the running app, so this is where those two actually get
 * exercised against the real components.
 */

const addCustomer = vi.fn();
const addOrder = vi.fn();
const addReviewRequest = vi.fn();

vi.mock('../context/ReviewSailContext', () => ({
  useReviewSail: () => ({
    addCustomer,
    addOrder,
    addReviewRequest,
    activeLocationId: 'loc-1',
    locations: [{ id: 'loc-1', name: 'Sea View Hotel' }],
    // Consumed by the embedded CSV wizard.
    bulkImport: vi.fn(),
    fetchExistingImportKeys: vi.fn().mockResolvedValue(new Set()),
  }),
}));

const fill = (label: RegExp, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

beforeEach(() => {
  vi.clearAllMocks();
  addCustomer.mockResolvedValue({ id: 'cust-1', firstName: 'Ada', lastName: 'Lovelace' });
  addOrder.mockResolvedValue({ id: 'order-1' });
  addReviewRequest.mockResolvedValue(undefined);
});

/** The form's labels aren't htmlFor-linked, so target inputs by placeholder. */
const setField = (placeholder: string, value: string) => {
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });
};

describe('the manual add-guest form', () => {
  it('records the reservation source on the stay', async () => {
    render(<SyncGuests />);

    setField('John', 'Ada');
    setField('Smith', 'Lovelace');
    setField('guest@example.com', 'ada@example.com');
    fireEvent.change(screen.getByLabelText(/Reservation Source/i), { target: { value: 'airbnb' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Guest & Queue Review/ }));

    await waitFor(() => expect(addOrder).toHaveBeenCalled());
    expect(addOrder.mock.calls[0][0]).toMatchObject({ source: 'airbnb', locationId: 'loc-1' });
  });

  it('defaults to a direct booking', async () => {
    render(<SyncGuests />);

    setField('John', 'Ada');
    setField('Smith', 'Lovelace');
    setField('guest@example.com', 'ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: /Add Guest & Queue Review/ }));

    await waitFor(() => expect(addOrder).toHaveBeenCalled());
    expect(addOrder.mock.calls[0][0].source).toBe('direct');
  });

  it('still queues a review request', async () => {
    render(<SyncGuests />);

    setField('John', 'Ada');
    setField('Smith', 'Lovelace');
    setField('guest@example.com', 'ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: /Add Guest & Queue Review/ }));

    await waitFor(() => expect(addReviewRequest).toHaveBeenCalledWith('order-1'));
  });

  it('rejects a guest with no way to be contacted', async () => {
    render(<SyncGuests />);

    setField('John', 'Ada');
    setField('Smith', 'Lovelace');
    fireEvent.click(screen.getByRole('button', { name: /Add Guest & Queue Review/ }));

    expect(await screen.findByText(/cannot be contacted/i)).toBeInTheDocument();
    expect(addCustomer).not.toHaveBeenCalled();
  });

  it('rejects a phone that is only formatting characters', async () => {
    // The old form counted "+1 555" as 6 characters and let it through; the
    // shared rule counts digits.
    render(<SyncGuests />);

    setField('John', 'Ada');
    setField('Smith', 'Lovelace');
    setField('+1 555-0100', '+1 555');
    fireEvent.click(screen.getByRole('button', { name: /Add Guest & Queue Review/ }));

    expect(await screen.findByText(/too short/i)).toBeInTheDocument();
    expect(addCustomer).not.toHaveBeenCalled();
  });

  it('rejects an address the browser accepts but we cannot deliver to', async () => {
    // "ada@b" satisfies the native type="email" check, which has no TLD rule,
    // so this is the case our own validation actually has to catch. A value
    // like "ada@" never reaches us at all — the browser blocks the submit.
    render(<SyncGuests />);

    setField('John', 'Ada');
    setField('Smith', 'Lovelace');
    setField('guest@example.com', 'ada@b');
    fireEvent.click(screen.getByRole('button', { name: /Add Guest & Queue Review/ }));

    expect(await screen.findByText(/Invalid email address/i)).toBeInTheDocument();
    expect(addCustomer).not.toHaveBeenCalled();
  });

  it('requires both halves of the name', async () => {
    render(<SyncGuests />);

    setField('John', 'Ada');
    setField('guest@example.com', 'ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: /Add Guest & Queue Review/ }));

    expect(await screen.findByText(/both required/i)).toBeInTheDocument();
    expect(addCustomer).not.toHaveBeenCalled();
  });

  it('keeps the chosen source after a successful add', async () => {
    render(<SyncGuests />);

    setField('John', 'Ada');
    setField('Smith', 'Lovelace');
    setField('guest@example.com', 'ada@example.com');
    fireEvent.change(screen.getByLabelText(/Reservation Source/i), { target: { value: 'booking_com' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Guest & Queue Review/ }));

    await waitFor(() => expect(addReviewRequest).toHaveBeenCalled());
    // An owner entering walk-ins is entering several in a row.
    expect((screen.getByLabelText(/Reservation Source/i) as HTMLSelectElement).value).toBe('booking_com');
    expect((screen.getByPlaceholderText('John') as HTMLInputElement).value).toBe('');
  });
});

describe('the template download', () => {
  it('offers a template button next to the format guide', () => {
    render(<SyncGuests />);

    expect(screen.getByRole('button', { name: /Download Template/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CSV Format Guide/ })).toBeInTheDocument();
  });

  it('generates a real CSV file client-side with no backend call', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<SyncGuests />);
    fireEvent.click(screen.getByRole('button', { name: /Download Template/ }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toContain('text/csv');

    createObjectURL.mockRestore();
    click.mockRestore();
  });
});
