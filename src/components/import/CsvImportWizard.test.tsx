import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CsvImportWizard from './CsvImportWizard';

/**
 * Drives the real wizard end to end with the data layer stubbed out.
 *
 * The page itself sits behind auth and a location selector, so this is where
 * the three flows that matter — an unrecognised file, a recognised OTA export,
 * and excluding rows before import — actually get exercised.
 */

const bulkImport = vi.fn();
const fetchExistingImportKeys = vi.fn();

vi.mock('../../context/ReviewSailContext', () => ({
  useReviewSail: () => ({
    activeLocationId: 'loc-1',
    bulkImport,
    fetchExistingImportKeys,
  }),
}));

const MISMATCHED_CSV = [
  'Given Name,Family Name,Guest Email Address,Contact Number,Departure,Arrival,Ref',
  'Ada,Lovelace,ada@example.com,+44 7700 900123,30/07/2026,27/07/2026,R1',
  'Grace,Hopper,not-an-email,+1 555 0100,05/08/2026,01/08/2026,R2',
  'Alan,Turing,alan@example.com,+1 555 0111,12/06/2026,09/06/2026,R3',
  'Katherine,Johnson,katherine@example.com,+1 555 0142,20/08/2026,17/08/2026,R4',
].join('\n');

const AIRBNB_CSV = [
  'Confirmation code,Status,Guest name,Contact,# of adults,Start date,End date,Listing,Earnings',
  'HMABC123,Confirmed,Maria Fernandez,+34 612 345 678,2,2026-07-27,2026-07-30,Sea View Loft,$420',
  'HMDEF456,Confirmed,James Okafor,+44 7700 900123,1,2026-08-03,2026-08-06,Sea View Loft,$390',
].join('\n');

/** Uploads a CSV and waits for the wizard to reach the mapping step. */
const upload = async (container: HTMLElement, csv: string, fileName = 'test.csv') => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([csv], fileName, { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText(/Preview — first/);
};

/** The select paired with a field label in the mapping step. */
const selectFor = (label: string): HTMLSelectElement =>
  screen.getByRole('combobox', { name: label }) as HTMLSelectElement;

/** The mapping row for a field — scopes badge queries away from the preview
    table, whose headers repeat the same labels. */
const rowFor = (label: string): HTMLElement =>
  selectFor(label).closest('div') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  fetchExistingImportKeys.mockResolvedValue(new Set<string>());
  bulkImport.mockResolvedValue({ success: true, imported: 0, skippedDuplicates: 0, failed: 0 });
});

describe('a CSV with mismatched headers', () => {
  it('guesses the columns and labels how confident it is', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);

    // Nothing matched an exact alias, so every guess is flagged for review.
    expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0);
    expect(selectFor('First name').value).toBe('Given Name');
    expect(selectFor('Check-out date').value).toBe('Departure');
    expect(selectFor('Check-in date').value).toBe('Arrival');
  });

  it('reports a field with no plausible column as not found', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, 'Ref,Total,Currency\nR1,100,GBP');

    expect(screen.getAllByText('Not found').length).toBeGreaterThan(0);
    expect(selectFor('Check-out date').value).toBe('');
  });

  it('blocks the continue button until the required columns are mapped', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);

    const continueButton = screen.getByRole('button', { name: /Check \d+ rows?/ });
    expect(continueButton).toBeEnabled();

    // Unmapping a required field must close the path forward.
    fireEvent.change(selectFor('Check-out date'), { target: { value: '' } });
    expect(continueButton).toBeDisabled();
    expect(screen.getByText(/Still need a check-out date/i)).toBeInTheDocument();

    fireEvent.change(selectFor('Check-out date'), { target: { value: 'Departure' } });
    expect(continueButton).toBeEnabled();
  });

  it('blocks continuing when no contact column is mapped', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);

    fireEvent.change(selectFor('Email'), { target: { value: '' } });
    fireEvent.change(selectFor('Phone'), { target: { value: '' } });

    expect(screen.getByRole('button', { name: /Check \d+ rows?/ })).toBeDisabled();
    expect(screen.getByText(/an email or phone column/i)).toBeInTheDocument();
  });

  it('clears the badge on a field whose column was taken by another field', async () => {
    // Exactly the sequence that produced "First name [Matched]" sitting above
    // an empty dropdown: point check-out at the first-name column, which
    // steals it, then set check-out back to nothing.
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);

    expect(selectFor('First name').value).toBe('Given Name');

    fireEvent.change(selectFor('Check-out date'), { target: { value: 'Given Name' } });
    expect(selectFor('First name').value).toBe('');

    // The badge must not still be claiming a match.
    expect(within(rowFor('First name')).queryByText('Matched')).not.toBeInTheDocument();
    expect(within(rowFor('First name')).queryByText('Needs review')).not.toBeInTheDocument();
  });

  it('never shows a badge that contradicts its own dropdown', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);

    // Unmapping by hand must not leave a "Matched" behind either.
    fireEvent.change(selectFor('Email'), { target: { value: '' } });
    expect(within(rowFor('Email')).queryByText('Matched')).not.toBeInTheDocument();
  });

  it('does not label two different controls "Reservation source"', async () => {
    // One is the CSV column mapping, the other the per-file fallback. Two
    // comboboxes with the same accessible name is a bug, not a style nit.
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);

    expect(screen.getByRole('combobox', { name: 'Reservation source' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Source for this file' })).toBeInTheDocument();
  });

  it('drops the confidence badge once the owner picks a column themselves', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);

    const before = screen.queryAllByText('Needs review').length;
    expect(before).toBeGreaterThan(0);
    fireEvent.change(selectFor('Email'), { target: { value: 'Ref' } });
    expect(screen.queryAllByText('Needs review').length).toBe(before - 1);
  });
});

describe('a recognised Airbnb export', () => {
  it('announces the detection and applies the mapping without asking', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, AIRBNB_CSV, 'reservations.csv');

    expect(screen.getByText(/Detected Airbnb export — mapping applied automatically/)).toBeInTheDocument();
    // Columns collapse — the owner shouldn't have to confirm work we're sure of.
    expect(screen.queryByRole('combobox', { name: 'First name' })).not.toBeInTheDocument();
  });

  it('still lets the owner open and adjust the columns', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, AIRBNB_CSV, 'reservations.csv');

    fireEvent.click(screen.getByRole('button', { name: /Review or adjust columns/ }));

    expect(selectFor('Check-out date').value).toBe('End date');
    expect(selectFor('Check-in date').value).toBe('Start date');
    expect(selectFor('Phone').value).toBe('Contact');
    // One combined name column, split on import rather than demanded as two.
    expect(selectFor('Full name').value).toBe('Guest name');
  });

  it('splits the combined guest name into first and last', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, AIRBNB_CSV, 'reservations.csv');

    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Import \d+ guests?/ }));

    await waitFor(() => expect(bulkImport).toHaveBeenCalled());
    expect(bulkImport.mock.calls[0][0][0]).toMatchObject({
      firstName: 'Maria',
      lastName: 'Fernandez',
    });
  });

  it('explains the gap when the export carries no way to reach the guest', async () => {
    // Same export minus the Contact column — the case where Airbnb gives
    // neither an email nor a phone.
    const noContact = AIRBNB_CSV
      .split('\n')
      .map(line => line.split(',').filter((_, i) => i !== 3).join(','))
      .join('\n');

    const { container } = render(<CsvImportWizard />);
    await upload(container, noContact, 'reservations.csv');

    expect(screen.getByText(/Airbnb hides guest addresses/)).toBeInTheDocument();
    // And it must not pretend the import can proceed.
    expect(screen.getByRole('button', { name: /Check \d+ rows?/ })).toBeDisabled();
  });

  it('stamps the detected platform onto every imported row', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, AIRBNB_CSV, 'reservations.csv');

    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));
    const importButton = await screen.findByRole('button', { name: /Import \d+ guests?/ });
    fireEvent.click(importButton);

    await waitFor(() => expect(bulkImport).toHaveBeenCalled());
    const rows = bulkImport.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.source === 'airbnb')).toBe(true);
    // Dates are ISO in this export, so they must survive unshifted.
    expect(rows[0].checkoutDate).toBe('2026-07-30');
  });
});

describe('the review step', () => {
  it('groups issues by kind rather than listing every row', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));

    // One malformed email in the file.
    const group = await screen.findByText(/Invalid email address/);
    expect(group).toBeInTheDocument();
    expect(within(group.closest('button')!).getByText('1')).toBeInTheDocument();
  });

  it('excludes a row and drops the ready count', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));

    const before = await screen.findByRole('button', { name: /Import 3 guests/ });
    expect(before).toBeInTheDocument();

    // Alan Turing checked out well outside the send window, so he's a warning.
    fireEvent.click(screen.getByText(/will expire without being sent/));
    const checkbox = screen.getByRole('checkbox', { checked: true });
    fireEvent.click(checkbox);

    expect(await screen.findByRole('button', { name: /Import 2 guests/ })).toBeInTheDocument();
    expect(screen.getByText(/You've excluded 1 row/)).toBeInTheDocument();
  });

  it('sends only the rows that survived exclusion', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));

    fireEvent.click(await screen.findByText(/will expire without being sent/));
    fireEvent.click(screen.getByRole('checkbox', { checked: true }));
    fireEvent.click(screen.getByRole('button', { name: /Import 2 guests/ }));

    await waitFor(() => expect(bulkImport).toHaveBeenCalled());
    const emails = bulkImport.mock.calls[0][0].map((r: any) => r.email);
    expect(emails).not.toContain('alan@example.com');
    expect(emails).toContain('ada@example.com');
  });

  it('never offers to import a row that failed validation', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));

    fireEvent.click(await screen.findByText(/Invalid email address/));
    // The bad row's checkbox is present but locked off.
    expect(screen.getByRole('checkbox', { checked: false })).toBeDisabled();
  });

  it('flags guests already imported for the same stay', async () => {
    fetchExistingImportKeys.mockResolvedValue(new Set(['ada@example.com|2026-07-30']));

    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));

    expect(await screen.findByText(/already been imported for the same/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import 2 guests/ })).toBeInTheDocument();
  });
});

describe('the completion state', () => {
  it('reports imported, skipped and failed as three explicit numbers', async () => {
    bulkImport.mockResolvedValue({ success: true, imported: 2, skippedDuplicates: 1, failed: 1 });

    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Import \d+ guests?/ }));

    expect(await screen.findByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText(/could not be saved/)).toBeInTheDocument();
  });

  it('surfaces a failure instead of claiming success', async () => {
    bulkImport.mockResolvedValue({
      success: false, imported: 0, skippedDuplicates: 0, failed: 3, error: 'No active location selected',
    });

    const { container } = render(<CsvImportWizard />);
    await upload(container, MISMATCHED_CSV);
    fireEvent.click(screen.getByRole('button', { name: /Check \d+ rows?/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Import \d+ guests?/ }));

    expect(await screen.findByText('No active location selected')).toBeInTheDocument();
    expect(screen.queryByText('Imported')).not.toBeInTheDocument();
  });
});

describe('date handling', () => {
  it('asks which way to read a column that could go either way', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, 'First Name,Last Name,Email,Checkout\nAda,Lovelace,a@b.com,03/04/2026');

    expect(screen.getByText(/could be read two ways/)).toBeInTheDocument();
  });

  it('says nothing about date format when the file has no date column', async () => {
    // A sales/CRM export has no dates at all. Warning that "these dates could
    // be read two ways" when there are no dates is pure noise.
    const { container } = render(<CsvImportWizard />);
    await upload(container, 'First Name,Last Name,Email Address,Headline,Notes\nAda,Lovelace,a@b.com,Engineer,x');

    expect(screen.queryByText(/could be read two ways/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Date format' })).not.toBeInTheDocument();
  });

  it('re-reads the convention when a date column is mapped by hand', async () => {
    // Detection used to run once at upload, so a column mapped afterwards
    // was parsed with a convention inferred from nothing.
    const { container } = render(<CsvImportWizard />);
    await upload(container, 'First Name,Last Name,Email,Left On\nAda,Lovelace,a@b.com,25/12/2026');

    expect(screen.queryByRole('combobox', { name: 'Date format' })).not.toBeInTheDocument();

    fireEvent.change(selectFor('Check-out date'), { target: { value: 'Left On' } });

    // 25 can only be a day, so day-first is pinned with no ambiguity warning.
    expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveValue('DMY');
    expect(screen.queryByText(/could be read two ways/)).not.toBeInTheDocument();
    expect(screen.getByText('25 Dec 2026')).toBeInTheDocument();
  });

  it('re-reads the preview when the convention is changed', async () => {
    const { container } = render(<CsvImportWizard />);
    await upload(container, 'First Name,Last Name,Email,Checkout\nAda,Lovelace,a@b.com,03/04/2026');

    expect(screen.getByText('3 Apr 2026')).toBeInTheDocument();

    const dateSelect = screen.getByDisplayValue(/Day first/);
    fireEvent.change(dateSelect, { target: { value: 'MDY' } });

    expect(screen.getByText('4 Mar 2026')).toBeInTheDocument();
  });
});
