-- Fix overly broad anon grants on sensitive business tables
-- These tables should NEVER be accessible to anon users (RLS or not)
REVOKE ALL ON public.accounts FROM anon;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.locations FROM anon;
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.message_templates FROM anon;
REVOKE ALL ON public.users FROM anon;

-- Keep anon INSERT on feedback (for customers submitting reviews)
-- Keep anon SELECT+UPDATE on review_requests (for the feedback link flow)
REVOKE DELETE ON public.review_requests FROM anon;
-- Keep anon INSERT on message_events (for logging feedback submissions)
-- Keep anon INSERT on opt_outs (for unsubscribe page)