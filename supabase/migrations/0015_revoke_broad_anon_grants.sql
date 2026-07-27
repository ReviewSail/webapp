-- private_feedback: anon only needs INSERT (for guest feedback gate)
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.private_feedback FROM anon;

-- recognition_records: anon needs nothing (only accessed by authenticated admins)
REVOKE ALL ON public.recognition_records FROM anon;

-- team_members: anon needs nothing
REVOKE ALL ON public.team_members FROM anon;

-- digest_settings: anon needs nothing
REVOKE ALL ON public.digest_settings FROM anon;