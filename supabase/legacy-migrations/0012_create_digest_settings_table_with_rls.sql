CREATE TABLE public.digest_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly', 'monthly')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.digest_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.digest_settings TO authenticated;

ALTER TABLE public.digest_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digest_settings_select_policy" ON public.digest_settings
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "digest_settings_insert_policy" ON public.digest_settings
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "digest_settings_update_policy" ON public.digest_settings
FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "digest_settings_delete_policy" ON public.digest_settings
FOR DELETE TO authenticated USING (auth.uid() = user_id);