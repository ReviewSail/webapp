-- Clean up remaining unnecessary anon grants
-- feedback: anon only needs INSERT (to submit reviews)
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.feedback FROM anon;

-- opt_outs: anon only needs INSERT (for unsubscribe page)
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.opt_outs FROM anon;

-- review_requests: anon only needs SELECT and UPDATE (for the feedback link flow)
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.review_requests FROM anon;