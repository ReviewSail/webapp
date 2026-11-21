import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createSummaryHandler } from './handler.ts';
import type { SummaryDatabase } from './handler.ts';

const config = {
  cronSecret: Deno.env.get('CRON_SECRET'),
  // Shared digest credentials only. Owner-alert credentials are independent.
  resendKey: Deno.env.get('RESEND_API_KEY'),
  from: Deno.env.get('RESEND_FROM_EMAIL'),
  appUrl: Deno.env.get('APP_URL'),
};

serve(createSummaryHandler(config, () => createClient(
  Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
) as unknown as SummaryDatabase));
