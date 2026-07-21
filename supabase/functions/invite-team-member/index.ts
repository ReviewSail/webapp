import { serve } from "https://deno.land/std@0.190.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { email, role, accountId, propertyName } = await req.json();

    if (!email || !accountId) {
      return new Response(JSON.stringify({ error: "Email and Account ID are required" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'reviews@maprated.com';
    const origin = req.headers.get('origin') || 'https://vqjzscdlfhgzzqhmkchw.supabase.co';

    // Construct the invite link that passes invite_account_id
    const inviteLink = `${origin}/login?invite_account_id=${accountId}`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <div style="background-color: #4f46e5; padding: 24px; text-align: center; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 800;">Join MapRated Team</h2>
          </div>
          <div style="padding: 32px; text-align: center;">
            <p style="margin-top: 0; font-size: 15px; line-height: 1.6; color: #475569;">
              You have been invited to join the <strong>${propertyName || 'Property Management'}</strong> team on MapRated as a <strong>${role}</strong>.
            </p>
            <div style="margin: 24px 0;">
              <a href="${inviteLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: bold; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 8px;">
                Accept Invite & Sign Up
              </a>
            </div>
            <p style="font-size: 11px; color: #94a3b8; margin: 0;">
              If the button doesn't work, copy and paste this link in your browser:<br/>
              <span style="color: #4f46e5; word-break: break-all;">${inviteLink}</span>
            </p>
          </div>
        </div>
      </div>
    `;

    if (resendApiKey) {
      console.log(`[invite-team-member] Dispatching Resend invite to ${email}`);
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: resendFromEmail,
          to: email,
          subject: `You've been invited to join MapRated`,
          html: emailHtml
        })
      });

      if (!emailResponse.ok) {
        const errTxt = await emailResponse.text();
        console.error(`[invite-team-member] Resend API Error:`, errTxt);
        throw new Error(errTxt);
      }
    } else {
      console.warn(`[invite-team-member] Resend API Key is missing. Simulation: Link is: ${inviteLink}`);
    }

    return new Response(JSON.stringify({ success: true, url: inviteLink }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[invite-team-member] Error processing invite:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})