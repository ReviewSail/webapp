-- Drop the old constraint
ALTER TABLE public.review_requests DROP CONSTRAINT IF EXISTS review_requests_status_check;

-- Recreate with all statuses used by the application
ALTER TABLE public.review_requests ADD CONSTRAINT review_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending',
    'sent',
    'clicked',
    'opted_out',
    'expired',
    'already_reviewed',
    'private_feedback'
  ]));