import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createOwnerAlertHandler } from './handler.ts';

const config = {
  cronSecret: Deno.env.get('CRON_SECRET'), enabled: Deno.env.get('OWNER_ALERTS_ENABLED'),
  // Never fall back to guest/digest credentials: their schedules are independent.
  resendKey: Deno.env.get('OWNER_ALERT_RESEND_API_KEY'),
  from: Deno.env.get('OWNER_ALERT_RESEND_FROM_EMAIL'), appUrl: Deno.env.get('APP_URL'),
};
// The request handler authenticates cron before this lazy service client is used.
serve(createOwnerAlertHandler(config, async (name, args) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  return await db.rpc(name, args);
}));
