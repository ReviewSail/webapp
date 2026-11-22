-- Drop and recreate the trigger function using vault secret for the Supabase URL
-- Note: This assumes the supabase_url is stored in vault.decrypted_secrets
CREATE OR REPLACE FUNCTION public.handle_new_private_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_url TEXT;
BEGIN
  -- Try to get the URL from vault secrets, fall back to the known URL
  BEGIN
    SELECT decrypted_secret INTO base_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_URL';
  EXCEPTION WHEN OTHERS THEN
    base_url := 'https://vqjzscdlfhgzzqhmkchw.supabase.co';
  END;

  PERFORM pg_net.http_post(
    base_url || '/functions/v1/scan-feedback-recognition',
    json_build_object('feedback_id', NEW.id)::text,
    'application/json'
  );
  RETURN NEW;
END;
$$;