-- 1. Create private_feedback table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.private_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID,
  location_id UUID,
  star_rating INTEGER CHECK (star_rating IS NULL OR (star_rating >= 1 AND star_rating <= 5)),
  feedback_text TEXT,
  guest_name TEXT,
  guest_email TEXT,
  is_read BOOLEAN DEFAULT false,
  manager_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create team_members and recognition_records tables
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('host','cohost','cleaner','property_manager','maintenance','front_desk','housekeeping','concierge','other')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recognition_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  matched_role TEXT,
  matched_sentence TEXT NOT NULL,
  guest_name TEXT,
  source TEXT NOT NULL CHECK (source IN ('midstay_reply','private_feedback')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Row-Level Security
ALTER TABLE public.private_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recognition_records ENABLE ROW LEVEL SECURITY;

-- 4. Grant Data API access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_feedback TO service_role;
GRANT SELECT ON public.private_feedback TO authenticated;
GRANT INSERT ON public.private_feedback TO anon; -- Public can submit feedback

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;

GRANT SELECT, INSERT ON public.recognition_records TO service_role;
GRANT SELECT ON public.recognition_records TO authenticated;

-- 5. RLS policies

-- private_feedback: admins can read feedback scoped to account
CREATE POLICY "private_feedback_select_admin" ON public.private_feedback
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
    AND u.account_id = (SELECT account_id FROM public.locations WHERE id = private_feedback.location_id)
  )
);

-- private_feedback: anyone can insert (guest feedback)
CREATE POLICY "private_feedback_insert_public" ON public.private_feedback
FOR INSERT TO anon
WITH CHECK (true);

CREATE POLICY "private_feedback_insert_authenticated" ON public.private_feedback
FOR INSERT TO authenticated
WITH CHECK (true);

-- team_members: admins manage members for their account
CREATE POLICY "team_members_manage_admin" ON public.team_members
FOR ALL TO authenticated
USING (
  account_id = get_current_account_id() AND
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  account_id = get_current_account_id() AND
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- recognition_records: admins can read their own account's records
CREATE POLICY "recognition_records_select_admin" ON public.recognition_records
FOR SELECT TO authenticated
USING (
  account_id = get_current_account_id() AND
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- 6. Trigger to auto-scan new feedback
CREATE OR REPLACE FUNCTION public.handle_new_private_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_net.http_post(
    'https://vqjzscdlfhgzzqhmkchw.supabase.co/functions/v1/scan-feedback-recognition',
    json_build_object('feedback_id', NEW.id)::text,
    'application/json'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_private_feedback_insert ON public.private_feedback;
CREATE TRIGGER on_private_feedback_insert
AFTER INSERT ON public.private_feedback
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_private_feedback();