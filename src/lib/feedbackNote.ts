import { supabase } from '../integrations/supabase/client';

/** Internal storage only. This never invokes an email/SMS/Booking.com sender. */
export async function saveInternalFeedbackNote(id: string, text: string): Promise<string> {
  const note = text.trim();
  if (!id || !note || note.length > 4000) throw new Error('Enter an internal note of 1–4,000 characters.');
  // EGRESS-COST: low — one RLS-scoped mutation and its explicit acknowledgement.
  const { data, error } = await supabase.from('guest_feedback')
    .update({ manager_response: note }).eq('id', id)
    .select('id, manager_response').maybeSingle();
  if (error || data?.id !== id || data?.manager_response !== note) {
    throw new Error('We could not confirm the note was saved. Your draft is still here. Retry or refresh to check the saved note. No guest message was sent.');
  }
  return data.manager_response;
}
