-- Add INSERT policy for message_events so the public feedback flow can log events
CREATE POLICY "message_events_insert_public" ON public.message_events
FOR INSERT TO public WITH CHECK (true);

-- Revoke overly broad anon grants on message_events (they only need INSERT)
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.message_events FROM anon;