import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '../ui/Button';

export function InternalFeedbackNote({ id, savedNote, onSaveNote }: {
  id: string; savedNote: string | null; onSaveNote: (id: string, note: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmedNote, setConfirmedNote] = useState<string | null>(null);
  const inFlight = useRef(false);
  const note = savedNote || confirmedNote;

  async function save() {
    if (inFlight.current || !draft.trim() || draft.trim().length > 4000) return;
    const submitted = draft.trim();
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await onSaveNote(id, submitted);
      setConfirmedNote(submitted);
      setDraft('');
      setEditing(false);
    } catch {
      setError('We could not confirm the note was saved. Your draft is still here. Retry or refresh to check the saved note. No guest message was sent.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (note) return <div className="rounded-lg border border-brand-100 bg-brand-50 p-3.5 text-sm">
    <p className="font-medium text-brand-800">Internal note — not sent to guest</p>
    <p className="mt-1 whitespace-pre-wrap text-ink-muted">{note}</p>
    {confirmedNote && <p role="status" className="mt-2 text-sm text-positive">Note saved internally. No guest message was sent.</p>}
  </div>;

  return <div className="space-y-2">
    <p className="text-xs text-ink-muted">Internal notes stay in ReviewSail. To reply to a guest, send a separate message through Booking.com or your usual guest communication channel.</p>
    {editing ? <form className="space-y-2" onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={busy}>
      <label htmlFor={'internal-note-' + id} className="text-sm font-medium">Internal note (not sent to guest)</label>
      <textarea id={'internal-note-' + id} rows={3} maxLength={4000} required readOnly={busy}
        value={draft} onChange={event => setDraft(event.target.value)}
        placeholder="Record an internal note, such as what needs attention."
        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink" />
      {error && <p role="alert" className="rounded-lg bg-critical-soft p-3 text-sm text-critical">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setDraft(''); setError(''); }}>Cancel</Button>
        <Button type="submit" icon={FileText} loading={busy} disabled={!draft.trim() || draft.trim().length > 4000}>{busy ? 'Saving note…' : 'Save internal note'}</Button>
      </div>
    </form> : <Button variant="secondary" icon={FileText} onClick={() => setEditing(true)}>Add internal note</Button>}
  </div>;
}
