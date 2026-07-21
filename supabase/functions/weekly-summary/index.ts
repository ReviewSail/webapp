import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log("[weekly-summary] Commencing weekly email report generator job...");
    
    // Read secure API keys
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'reviews@maprated.com';

    // Initialize service client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate past 7 days range
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoISO = oneWeekAgo.toISOString();

    // 1. Fetch all locations with templates and account owners
    const { data: locations, error: locError } = await supabase
      .from('locations')
      .select(`
        id,
        name,
        account_id
      `);

    if (locError || !locations) {
      throw locError || new Error("Failed to load locations");
    }

    console.log(`[weekly-summary] Loaded ${locations.length} locations to analyze.`);

    // Match locations with account email addresses.
    // Let's grab all active user emails from authentication or our public users database
    // Note: We use auth.users mock emails or public users joined with auth details.
    // Since we're in service role, we can read from users.
    const { data: users, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        account_id,
        role
      `);

    if (userError) {
      console.error("[weekly-summary] Failed to query accounts owners database:", userError);
    }

    // Now let's loop through each location to compile and deliver reports
    for (const loc of locations) {
      // Find the account owners for this location
      const ownerUsers = users?.filter(u => u.account_id === loc.account_id) || [];
      if (ownerUsers.length === 0) {
        console.log(`[weekly-summary] Skipping location "${loc.name}" (ID: ${loc.id}): No associated admin users.`);
        continue;
      }

      // Fetch the email for the first owner from auth.users (mock/direct)
      // Since supabase-js auth API can list users, we'll extract the emails
      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(ownerUsers[0].id);
      const ownerEmail = authData?.user?.email;

      if (!ownerEmail) {
        console.log(`[weekly-summary] Skipping location "${loc.name}": Account owner does not have a registered email address.`);
        continue;
      }

      // 2. Fetch last week's review requests for this location
      // Query orders checked out / completed within this location over last 7 days
      const { data: lastWeekOrders, error: ordersError } = await supabase
        .from('orders')
        .select('id')
        .eq('location_id', loc.id)
        .gte('created_at', oneWeekAgoISO);

      if (ordersError || !lastWeekOrders || lastWeekOrders.length === 0) {
        console.log(`[weekly-summary] Skipping "${loc.name}": Zero invites generated last week.`);
        continue;
      }

      const orderIds = lastWeekOrders.map(o => o.id);

      // Query review requests
      const { data: requests, error: requestsError } = await supabase
        .from('review_requests')
        .select('id, status')
        .in('order_id', orderIds);

      if (requestsError || !requests || requests.length === 0) {
        console.log(`[weekly-summary] Skipping "${loc.name}": No review requests created last week.`);
        continue;
      }

      const requestIds = requests.map(r => r.id);

      // Calculate Sent/Clicked metrics
      const totalInvitesSent = requests.filter(r => ['sent', 'clicked'].includes(r.status)).length;
      if (totalInvitesSent === 0) {
        console.log(`[weekly-summary] Skipping "${loc.name}": Zero invitations were sent over the past 7 days.`);
        continue;
      }

      const clickedInvites = requests.filter(r => r.status === 'clicked').length;
      const clickRate = totalInvitesSent > 0 ? Math.round((clickedInvites / totalInvitesSent) * 100) : 0;

      // Calculate Delivery Rate
      const { data: events, error: eventsError } = await supabase
        .from('message_events')
        .select('event_type')
        .in('request_id', requestIds);

      let deliveryRate = 100;
      if (!eventsError && events && events.length > 0) {
        const totalAttempts = events.filter(e => ['sent', 'reminder_sent', 'failed'].includes(e.event_type)).length;
        const successful = events.filter(e => ['sent', 'reminder_sent'].includes(e.event_type)).length;
        deliveryRate = totalAttempts > 0 ? Math.round((successful / totalAttempts) * 100) : 100;
      }

      // Calculate Average Rating
      const { data: feedbacks, error: fbError } = await supabase
        .from('feedback')
        .select('rating')
        .in('request_id', requestIds);

      let averageRating = 'No feedback yet';
      if (!fbError && feedbacks && feedbacks.length > 0) {
        const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
        averageRating = `${Math.round((sum / feedbacks.length) * 10) / 10} / 5 Stars`;
      }

      // 3. Draft clean HTML email body
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px; text-align: center; color: #ffffff;">
              <span style="background-color: rgba(255, 255, 255, 0.2); color: #ffffff; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">Performance Report</span>
              <h1 style="margin: 12px 0 0 0; font-size: 22px; font-weight: 800; tracking-tight: -0.025em;">Weekly Summary</h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #e0e7ff;">${loc.name}</p>
            </div>

            <!-- Body Content -->
            <div style="padding: 32px;">
              <p style="margin-top: 0; font-size: 15px; line-height: 1.6; color: #475569;">
                Hi there, here is your MapRated summary report highlighting invite deliverability, link clicks, and private rating averages compiled over the past 7 days for <strong>${loc.name}</strong>:
              </p>

              <!-- Metrics Table -->
              <table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 14px;">
                <thead>
                  <tr style="border-bottom: 2px solid #e2e8f0;">
                    <th style="text-align: left; padding: 12px 8px; font-weight: bold; color: #475569;">Metric Category</th>
                    <th style="text-align: right; padding: 12px 8px; font-weight: bold; color: #4f46e5;">Weekly Performance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 14px 8px; color: #64748b; font-weight: 500;">Total Invitations Sent</td>
                    <td style="text-align: right; padding: 14px 8px; font-weight: bold; color: #1e293b;">${totalInvitesSent}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 14px 8px; color: #64748b; font-weight: 500;">Delivery Success Rate</td>
                    <td style="text-align: right; padding: 14px 8px; font-weight: bold; color: #1e293b;">${deliveryRate}%</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 14px 8px; color: #64748b; font-weight: 500;">Review Link Click Rate</td>
                    <td style="text-align: right; padding: 14px 8px; font-weight: bold; color: #1e293b;">${clickRate}%</td>
                  </tr>
                  <tr>
                    <td style="padding: 14px 8px; color: #64748b; font-weight: 500;">Private Feedback Average</td>
                    <td style="text-align: right; padding: 14px 8px; font-weight: bold; color: #10b981;">${averageRating}</td>
                  </tr>
                </tbody>
              </table>

              <!-- Action Call -->
              <div style="text-align: center; margin-top: 32px; margin-bottom: 16px;">
                <a href="https://vqjzscdlfhgzzqhmkchw.supabase.co/dashboard" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 13px; text-decoration: none; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                  View Full Dashboard
                </a>
              </div>
            </div>

            <!-- Footer Compliance -->
            <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
              <p style="margin: 0;">Sent automatically by MapRated Review Automation Systems.</p>
              <p style="margin: 4px 0 0 0;">Manage your dispatch notifications inside the settings page in your dashboard account.</p>
            </div>
          </div>
        </div>
      `;

      // 4. Send email via Resend
      if (resendApiKey) {
        try {
          console.log(`[weekly-summary] Dispaching Resend email report to owner email: ${ownerEmail}`);
          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: resendFromEmail,
              to: ownerEmail,
              subject: `Your MapRated Weekly Summary — ${loc.name}`,
              html: emailHtml
            })
          });

          if (emailResponse.ok) {
            console.log(`[weekly-summary] Weekly report email dispatched successfully to ${ownerEmail}`);
          } else {
            const errTxt = await emailResponse.text();
            console.error(`[weekly-summary] Resend API Error for weekly report email:`, errTxt);
          }
        } catch (resendErr) {
          console.error(`[weekly-summary] Resend Network Error:`, resendErr);
        }
      } else {
        console.warn(`[weekly-summary] Stripe / Resend Key missing. Mocking Weekly summary delivery to "${ownerEmail}" for property "${loc.name}".`);
      }
    }

    return new Response(JSON.stringify({ success: true, message: "Weekly summary reports processing completed" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("[weekly-summary] Unexpected job failure:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})