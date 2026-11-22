import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Temporary safety hold, not a completed deletion workflow. The old sequence
// deleted tenant data before Auth cleanup and could leave billing or identities
// orphaned. Do not restore it until a durable, resumable workflow is verified.
serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return reply(405, { error: 'POST required.' })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return reply(401, { error: 'Please sign in.' })
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return reply(401, { error: 'Please sign in again.' })
    // EGRESS-COST: low — one caller's membership, no privileged mutations.
    const { data: member, error: memberError } = await client.from('users')
      .select('account_id,role').eq('id', user.id).single()
    if (memberError || !member?.account_id) return reply(409, { error: 'Account lookup failed. Nothing was deleted.' })
    if (member.role !== 'admin') return reply(403, { error: 'Only admins can request account deletion.' })
    return reply(409, { code: 'deletion_requires_review', success: false,
      error: 'Self-service deletion is temporarily paused for safety. Contact support to review billing and team access. Nothing was deleted or canceled.' })
  } catch {
    return reply(503, { error: 'Deletion unavailable. Nothing was deleted or canceled.' })
  }
})
