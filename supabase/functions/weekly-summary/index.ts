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
    console.log("[weekly-summary] Digest job starting...");

    // Allow forcing a specific frequency for manual triggers
    let forcedFrequency: 'weekly' | 'monthly' | null = null;
    try {
      const body = await req.json();
      if (body && body.frequency && ['weekly', 'monthly'].includes(body.frequency)) {
        forcedFrequency = body.frequency as 'weekly' | 'monthly';
        console.log(`[weekly-summary] Forced frequency: ${forcedFrequency}`);
      }
    } catch {
      // No body or invalid JSON — proceed normally
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'reviews@maprated.com';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate date range
    const now = new Date();
    let periodStart: Date;

    if (forcedFrequency === 'monthly') {
      periodStart = new Date(now);
      periodStart.setMonth(periodStart.getMonth() - 1);
    } else {
      periodStart = new Date(now);
      periodStart.setDate(periodStart.getDate() - 7);
    }

    const periodStartISO = periodStart.toISOString();
    const periodLabel = forcedFrequency === 'monthly' ? 'Monthly' : 'Weekly';
    const periodLabelLower = forcedFrequency === 'monthly' ? 'monthly' : 'weekly';

    console.log(`[weekly-summary] Period: ${periodLabel}, starting ${periodStartISO}`);

    // 1. Fetch all accounts with locations
    const { data: accounts, error: accError } = await supabase
      .from('accounts')
      .select(`
        id,
        name,
        locations (id, name, recovery_email)
      `);

    if (accError) {
      throw new Error(`Failed to load accounts: ${accError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      console.log("[weekly-summary] No accounts found.");
      return new Response(JSON.stringify({ success: true, message: "No accounts to process" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    console.log(`[weekly-summary] Loaded ${accounts.length} accounts.`);

    // 2. Fetch all digest settings
    const { data: digestSettings, error: dsError } = await supabase
      .from('digest_settings')
      .select('*');

    if (dsError) {
      console.error("[weekly-summary] Failed to fetch digest settings:", dsError);
    }

    const digestMap = new Map<string, { frequency: string; enabled: boolean }>();
    if (digestSettings) {
      for (const ds of digestSettings) {
        digestMap.set(ds.user_id, { frequency: ds.frequency, enabled: ds.enabled });
      }
    }

    // 3. Fetch all users (to find admins and their emails)
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError) {
      console.error("[weekly-summary] Failed to query users:", usersError);
    }

    // Group users by account
    const usersByAccount = new Map<string, Array<{ id: string; email: string | null; role: string | null; fullName: string | null }>>();
    if (allUsers) {
      for (const u of allUsers) {
        if (!u.account_id) continue;
        const existing = usersByAccount.get(u.account_id) || [];
        existing.push({
          id: u.id,
          email: u.email,
          role: u.role,
          fullName: u.full_name,
        });
        usersByAccount.set(u.account_id, existing);
      }
    }

    let totalSent = 0;
    let totalSkipped = 0;

    // 4. Process each account
    for (const account of (accounts as any[])) {
      const accountId = account.id;
      const accountName = account.name || 'Your Account';
      const locations = account.locations || [];

      if (locations.length === 0) {
        console.log(`[weekly-summary] Skipping account "${accountName}": No locations.`);
        continue;
      }

      // Find admin users for this account
      const accountUsers = usersByAccount.get(accountId) || [];
      const adminUsers = accountUsers.filter(u => u.role === 'admin' || u.role === 'owner');

      if (adminUsers.length === 0) {
        console.log(`[weekly-summary] Skipping account "${accountName}": No admin users found.`);
        totalSkipped++;
        continue;
      }

      console.log(`[weekly-summary] Processing account "${accountName}" with ${locations.length} location(s) and ${adminUsers.length} admin user(s).`);

      // Compute aggregate metrics across ALL properties for this account
      const locationIds = locations.map((l: any) => l.id);

      // Fetch orders created in the period
      const { data: periodOrders, error: ordersErr } = await supabase
        .from('orders')
        .select('id, location_id, midstay_sent, midstay_sent_at, checkin_date')
        .in('location_id', locationIds)
        .gte('created_at', periodStartISO);

      if (ordersErr) {
        console.error(`[weekly-summary] Error fetching orders for account ${accountName}:`, ordersErr);
        continue;
      }

      if (!periodOrders || periodOrders.length === 0) {
        console.log(`[weekly-summary] No orders found for account "${accountName}" in period.`);
      }

      const orderIds = (periodOrders || []).map((o: any) => o.id);

      // Fetch review requests for these orders
      let requestIds: string[] = [];
      if (orderIds.length > 0) {
        const { data: requests, error: reqErr } = await supabase
          .from('review_requests')
          .select('id, status')
          .in('order_id', orderIds);

        if (!reqErr && requests) {
          requestIds = requests.map((r: any) => r.id);
        }
      }

      // Fetch feedback (private reviews captured via ReviewSail)
      let feedbackEntries: Array<{ rating: number }> = [];
      if (requestIds.length > 0) {
        const { data: fb, error: fbErr } = await supabase
          .from('feedback')
          .select('rating')
          .in('request_id', requestIds);

        if (!fbErr && fb) {
          feedbackEntries = fb;
        }
      }

      // Calculate metrics
      const totalInvitesSent = orderIds.length;
      const reviewsReceived = feedbackEntries.length;
      const avgRating = reviewsReceived > 0
        ? (feedbackEntries.reduce((sum, f) => sum + f.rating, 0) / reviewsReceived)
        : null;

      // Mid-stay saves: mid-stay check-ins that were sent in this period
      const midstaySentInPeriod = (periodOrders || []).filter((o: any) =>
        o.midstay_sent === true && o.midstay_sent_at && new Date(o.midstay_sent_at) >= periodStart
      ).length;

      // Build per-location breakdown for the email
      const locationMetrics: Array<{
        name: string;
        invites: number;
        reviews: number;
        avgRating: number | null;
        midstaySaves: number;
      }> = [];

      for (const loc of locations) {
        const locOrders = (periodOrders || []).filter((o: any) => o.location_id === loc.id);
        const locOrderIds = locOrders.map((o: any) => o.id);

        let locRequestIds: string[] = [];
        if (locOrderIds.length > 0) {
          const { data: locReqs } = await supabase
            .from('review_requests')
            .select('id')
            .in('order_id', locOrderIds);
          if (locReqs) locRequestIds = locReqs.map((r: any) => r.id);
        }

        let locFeedbacks: Array<{ rating: number }> = [];
        if (locRequestIds.length > 0) {
          const { data: locFb } = await supabase
            .from('feedback')
            .select('rating')
            .in('request_id', locRequestIds);
          if (locFb) locFeedbacks = locFb;
        }

        const locMidstaySent = locOrders.filter((o: any) =>
          o.midstay_sent === true && o.midstay_sent_at && new Date(o.midstay_sent_at) >= periodStart
        ).length;

        locationMetrics.push({
          name: loc.name,
          invites: locOrderIds.length,
          reviews: locFeedbacks.length,
          avgRating: locFeedbacks.length > 0
            ? locFeedbacks.reduce((sum, f) => sum + f.rating, 0) / locFeedbacks.length
            : null,
          midstaySaves: locMidstaySent,
        });
      }

      // For each admin user, check their digest preferences and send
      for (const admin of adminUsers) {
        const prefs = digestMap.get(admin.id);

        // If no preferences set, default to enabled weekly
        const isEnabled = prefs ? prefs.enabled : true;
        const userFrequency = prefs ? prefs.frequency : 'weekly';

        // Skip if disabled
        if (!isEnabled) {
          console.log(`[weekly-summary] Skipping user ${admin.email} (${admin.fullName}): digest disabled.`);
          totalSkipped++;
          continue;
        }

        // Skip if frequency doesn't match (unless forced)
        if (!forcedFrequency && userFrequency !== periodLabelLower) {
          console.log(`[weekly-summary] Skipping user ${admin.email}: prefers ${userFrequency}, running ${periodLabelLower}.`);
          totalSkipped++;
          continue;
        }

        const ownerEmail = admin.email;
        if (!ownerEmail) {
          console.log(`[weekly-summary] Skipping user ${admin.id}: no email on record.`);
          totalSkipped++;
          continue;
        }

        const ownerName = admin.fullName || 'Valued Partner';

        // Build locations table rows HTML
        const locationRowsHtml = locationMetrics.map(loc => {
          const ratingDisplay = loc.avgRating !== null
            ? `${loc.avgRating.toFixed(1)} / 5`
            : '—';
          return `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 12px 8px; color: #1e293b; font-weight: 500;">${loc.name}</td>
              <td style="text-align: center; padding: 12px 8px; color: #475569;">${loc.invites}</td>
              <td style="text-align: center; padding: 12px 8px; color: #475569;">${loc.reviews}</td>
              <td style="text-align: center; padding: 12px 8px; font-weight: 600; color: ${loc.avgRating !== null && loc.avgRating >= 4 ? '#10b981' : loc.avgRating !== null && loc.avgRating >= 3 ? '#f59e0b' : '#ef4444'};">${ratingDisplay}</td>
              <td style="text-align: center; padding: 12px 8px; color: #475569;">${loc.midstaySaves}</td>
            </tr>
          `;
        }).join('');

        const totalRatingDisplay = avgRating !== null
          ? `${avgRating.toFixed(1)} / 5`
          : 'No ratings yet';

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px; text-align: center; color: #ffffff;">
                <span style="background-color: rgba(255, 255, 255, 0.2); color: #ffffff; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">Owner Digest</span>
                <h1 style="margin: 12px 0 0 0; font-size: 22px; font-weight: 800; letter-spacing: -0.025em;">${periodLabel} Summary</h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #e0e7ff;">${accountName}</p>
              </div>

              <!-- Body -->
              <div style="padding: 32px;">
                <p style="margin-top: 0; font-size: 15px; line-height: 1.6; color: #475569;">
                  Hi ${ownerName}, here is your ${periodLabel.toLowerCase()} digest for <strong>${accountName}</strong>. See how your properties performed across guest engagement, feedback, and mid-stay check-ins.
                </p>

                <!-- Summary KPI Cards -->
                <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
                  <tr>
                    <td style="width: 25%; padding: 4px;">
                      <div style="background: #f0fdf4; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #bbf7d0;">
                        <p style="margin: 0; font-size: 24px; font-weight: 800; color: #16a34a;">${reviewsReceived}</p>
                        <p style="margin: 4px 0 0; font-size: 11px; color: #15803d; font-weight: 500;">Reviews Received</p>
                      </div>
                    </td>
                    <td style="width: 25%; padding: 4px;">
                      <div style="background: #fefce8; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #fde68a;">
                        <p style="margin: 0; font-size: 24px; font-weight: 800; color: #ca8a04;">${avgRating !== null ? avgRating.toFixed(1) : '—'}</p>
                        <p style="margin: 4px 0 0; font-size: 11px; color: #a16207; font-weight: 500;">Avg Rating</p>
                      </div>
                    </td>
                    <td style="width: 25%; padding: 4px;">
                      <div style="background: #f0f9ff; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #bae6fd;">
                        <p style="margin: 0; font-size: 24px; font-weight: 800; color: #0284c7;">${reviewsReceived}</p>
                        <p style="margin: 4px 0 0; font-size: 11px; color: #0369a1; font-weight: 500;">Private Feedback</p>
                      </div>
                    </td>
                    <td style="width: 25%; padding: 4px;">
                      <div style="background: #f5f3ff; border-radius: 12px; padding: 16px; text-align: center; border: 1px solid #ddd6fe;">
                        <p style="margin: 0; font-size: 24px; font-weight: 800; color: #7c3aed;">${midstaySentInPeriod}</p>
                        <p style="margin: 4px 0 0; font-size: 11px; color: #6d28d9; font-weight: 500;">Mid-Stay Saves</p>
                      </div>
                    </td>
                  </tr>
                </table>

                ${locationMetrics.length > 1 ? `
                  <!-- Per-Property Breakdown -->
                  <h3 style="font-size: 14px; font-weight: 700; color: #0f172a; margin: 28px 0 12px 0;">Per-Property Breakdown</h3>
                  <table style="width: 100%; border-collapse: collapse; margin: 8px 0 24px; font-size: 13px;">
                    <thead>
                      <tr style="border-bottom: 2px solid #e2e8f0;">
                        <th style="text-align: left; padding: 10px 8px; font-weight: 700; color: #475569;">Property</th>
                        <th style="text-align: center; padding: 10px 8px; font-weight: 700; color: #475569;">Invites</th>
                        <th style="text-align: center; padding: 10px 8px; font-weight: 700; color: #475569;">Reviews</th>
                        <th style="text-align: center; padding: 10px 8px; font-weight: 700; color: #475569;">Avg Rating</th>
                        <th style="text-align: center; padding: 10px 8px; font-weight: 700; color: #475569;">Mid-Stay</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${locationRowsHtml}
                    </tbody>
                  </table>
                ` : ''}

                <!-- What This Means Section -->
                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #e2e8f0;">
                  <h4 style="margin: 0 0 12px; font-size: 13px; font-weight: 700; color: #0f172a;">What These Numbers Mean</h4>
                  <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 6px 8px; vertical-align: top; width: 24px; color: #16a34a; font-weight: bold;">•</td>
                      <td style="padding: 6px 8px; color: #475569;"><strong>Reviews Received</strong> — Guests who completed feedback. More reviews = more visibility.</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 8px; vertical-align: top; width: 24px; color: #0284c7; font-weight: bold;">•</td>
                      <td style="padding: 6px 8px; color: #475569;"><strong>Private Feedback</strong> — Issues caught privately before they become public Google reviews.</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 8px; vertical-align: top; width: 24px; color: #7c3aed; font-weight: bold;">•</td>
                      <td style="padding: 6px 8px; color: #475569;"><strong>Mid-Stay Saves</strong> — Proactive check-ins during guest stays that can prevent negative outcomes.</td>
                    </tr>
                  </table>
                </div>

                <!-- CTA -->
                <div style="text-align: center; margin: 28px 0 16px;">
                  <a href="https://vqjzscdlfhgzzqhmkchw.supabase.co/dashboard" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 14px; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    View Full Dashboard
                  </a>
                </div>
                <p style="text-align: center; font-size: 12px; color: #94a3b8; margin: 4px 0 0;">
                  See detailed feedback, respond to guests, and manage settings.
                </p>
              </div>

              <!-- Footer -->
              <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.5;">
                <p style="margin: 0;">Sent automatically by ReviewSail on behalf of your account.</p>
                <p style="margin: 4px 0 0;">
                  <a href="https://vqjzscdlfhgzzqhmkchw.supabase.co/settings?tab=account" style="color: #6366f1; text-decoration: underline;">Manage digest preferences</a>
                  &nbsp;·&nbsp;
                  <a href="https://vqjzscdlfhgzzqhmkchw.supabase.co/unsubscribe" style="color: #94a3b8; text-decoration: underline;">Unsubscribe</a>
                </p>
              </div>
            </div>
          </div>
        `;

        // Send email via Resend
        if (resendApiKey) {
          try {
            console.log(`[weekly-summary] Sending ${periodLabelLower} digest to ${ownerEmail}`);
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: resendFromEmail,
                to: ownerEmail,
                subject: `Your ${periodLabel} Digest — ${accountName} (${periodStart.toLocaleDateString()} - ${now.toLocaleDateString()})`,
                html: emailHtml,
              }),
            });

            if (emailResponse.ok) {
              console.log(`[weekly-summary] Digest sent successfully to ${ownerEmail}`);
              totalSent++;
            } else {
              const errTxt = await emailResponse.text();
              console.error(`[weekly-summary] Resend error for ${ownerEmail}:`, errTxt);
            }
          } catch (resendErr) {
            console.error(`[weekly-summary] Resend network error for ${ownerEmail}:`, resendErr);
          }
        } else {
          console.warn(`[weekly-summary] No RESEND_API_KEY configured. Would have sent digest to ${ownerEmail}.`);
        }
      }
    }

    console.log(`[weekly-summary] Digest job complete. Sent: ${totalSent}, Skipped: ${totalSkipped}`);

    return new Response(JSON.stringify({
      success: true,
      message: `${periodLabel} digest processing completed`,
      sent: totalSent,
      skipped: totalSkipped,
    }), {
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
