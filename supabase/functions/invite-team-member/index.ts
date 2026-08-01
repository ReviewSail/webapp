import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** URL-safe, 256 bits. This token is the only thing standing between a link and account access. */
const generateToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // The caller's own row is the only source of truth for which account this
    // invite belongs to. The request body used to supply accountId, which let
    // any signed-in user invite themselves into any account they could name.
    const { data: caller, error: callerError } = await supabase
      .from('users')
      .select('account_id, role')
      .eq('id', user.id)
      .single()

    if (callerError || !caller) {
      return json({ error: 'Account not found' }, 404)
    }

    if (caller.role !== 'admin') {
      return json({ error: 'Only admins can invite team members.' }, 403)
    }

    const accountId: string = caller.account_id

    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = body.role === 'admin' ? 'admin' : 'staff'

    if (!EMAIL_RE.test(email)) {
      return json({ error: 'Enter a valid email address.' }, 400)
    }

    const service = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    // Already on the team — inviting them again would do nothing useful.
    const { data: existingMember } = await service
      .from('users')
      .select('id')
      .eq('account_id', accountId)
      .ilike('email', email)
      .maybeSingle()

    if (existingMember) {
      return json({ error: 'That person is already on your team.' }, 409)
    }

    // Resending supersedes any live invite, so the recipient always has exactly
    // one working link and a fresh expiry.
    await service
      .from('invitations')
      .update({ status: 'revoked' })
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .ilike('email', email)

    const token = generateToken()
    const { data: invitation, error: insertError } = await service
      .from('invitations')
      .insert({ account_id: accountId, email, role, token, invited_by: user.id })
      .select('id, email, role, expires_at, created_at, status')
      .single()

    if (insertError || !invitation) {
      console.error('[invite-team-member] Failed to create invitation:', insertError)
      return json({ error: "Couldn't create the invite. Try again." }, 500)
    }

    const { data: account } = await service
      .from('accounts')
      .select('name')
      .eq('id', accountId)
      .single()

    // APP_URL wins over the request's Origin header. The link in this email is
    // a credential — it carries the invite token — and Origin is supplied by
    // whatever client called the function, so letting it choose the host meant
    // the token could be addressed somewhere other than the real app. Origin is
    // only a fallback for deployments that have not set APP_URL.
    const appUrl = Deno.env.get('APP_URL')?.replace(/\/+$/, '')
    if (!appUrl) {
      console.warn('[invite-team-member] APP_URL is not set; falling back to the request origin for the invite link.')
    }
    const origin = (appUrl || req.headers.get('origin') || supabaseUrl).replace(/\/+$/, '')
    const inviteLink = `${origin}/accept-invite?token=${encodeURIComponent(token)}`

    const propertyName = escapeHtml(account?.name || 'the team')
    const roleLabel = role === 'admin' ? 'an admin' : 'a staff member'

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 800;">Join ${propertyName} on ReviewSail</h2>
          </div>
          <div style="padding: 32px; text-align: center;">
            <p style="margin-top: 0; font-size: 15px; line-height: 1.6; color: #475569;">
              You've been invited to join <strong>${propertyName}</strong> on ReviewSail as ${roleLabel}.
            </p>
            <div style="margin: 24px 0;">
              <a href="${inviteLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 8px;">
                Accept invite
              </a>
            </div>
            <p style="font-size: 12px; color: #64748b; margin: 0 0 16px;">
              Accept it with this email address (${escapeHtml(email)}). The link expires in 7 days.
            </p>
            <p style="font-size: 11px; color: #94a3b8; margin: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br/>
              <span style="color: #4f46e5; word-break: break-all;">${inviteLink}</span>
            </p>
          </div>
        </div>
      </div>
    `

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'reviews@reviewsail.com'

    if (resendApiKey) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: email,
          subject: `You've been invited to join ReviewSail`,
          html: emailHtml,
        }),
      })

      if (!emailResponse.ok) {
        // The invite row exists but nobody will ever see the link, so retract it
        // rather than leaving a pending invite that cannot be accepted.
        console.error('[invite-team-member] Resend API error:', await emailResponse.text())
        await service.from('invitations').update({ status: 'revoked' }).eq('id', invitation.id)
        return json({ error: "Couldn't send the invite email. Check the sender domain and try again." }, 502)
      }
    } else {
      console.warn(`[invite-team-member] RESEND_API_KEY missing. Invite link: ${inviteLink}`)
    }

    return json({ success: true, invitation, emailed: !!resendApiKey })

  } catch (error) {
    console.error('[invite-team-member] Unexpected error:', error)
    return json({ error: "Couldn't create the invite. Try again." }, 500)
  }
})
