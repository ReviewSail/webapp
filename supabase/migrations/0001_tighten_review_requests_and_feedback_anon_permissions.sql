-- Drop the overly permissive anon policies
DROP POLICY IF EXISTS "review_requests_anon_select" ON public.review_requests;
DROP POLICY IF EXISTS "review_requests_anon_update" ON public.review_requests;

-- SELECT for anon: only review requests that are in a "sent" state (ones that customers would have received links for)
CREATE POLICY "review_requests_anon_select" ON public.review_requests
FOR SELECT TO anon USING (status IN ('sent', 'clicked', 'pending'));

-- UPDATE for anon: only allow updating a sent request to clicked or already_reviewed
CREATE POLICY "review_requests_anon_update" ON public.review_requests
FOR UPDATE TO anon USING (status = 'sent') WITH CHECK (status IN ('clicked', 'already_reviewed'));

-- Also fix the grants: remove DELETE, INSERT grants for anon on review_requests (they don't need them)
REVOKE DELETE ON public.review_requests FROM anon;
REVOKE INSERT ON public.review_requests FROM anon;

-- And for feedback: revoke DELETE from anon since it's not needed
REVOKE DELETE ON public.feedback FROM anon;