-- First, drop the overly permissive policies
DROP POLICY IF EXISTS "feedback_select_policy" ON public.feedback;
DROP POLICY IF EXISTS "feedback_insert_policy" ON public.feedback;
DROP POLICY IF EXISTS "feedback_update_policy" ON public.feedback;

-- SELECT policy: authenticated users can only see feedback for their account's review requests
CREATE POLICY "feedback_select_account_scoped" ON public.feedback
FOR SELECT TO authenticated USING (
  request_id IN (
    SELECT rr.id FROM review_requests rr
    JOIN orders o ON rr.order_id = o.id
    JOIN locations l ON o.location_id = l.id
    WHERE l.account_id = get_current_account_id()
  )
);

-- INSERT policy: customers/public can submit feedback (no auth needed)
CREATE POLICY "feedback_insert_public" ON public.feedback
FOR INSERT TO public WITH CHECK (true);

-- UPDATE policy: authenticated users can only update feedback within their account
CREATE POLICY "feedback_update_account_scoped" ON public.feedback
FOR UPDATE TO authenticated USING (
  request_id IN (
    SELECT rr.id FROM review_requests rr
    JOIN orders o ON rr.order_id = o.id
    JOIN locations l ON o.location_id = l.id
    WHERE l.account_id = get_current_account_id()
  )
);

-- Add DELETE policy to prevent authenticated users from deleting feedback (safety)
-- No policy = denied by default, which is what we want