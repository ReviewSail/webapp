// Only a confirmed Stripe-hosted URL is a checkout handoff, not payment success.
export async function checkoutOutcome(data: any, error: any): Promise<{
  success: boolean; url?: string; error?: string;
}> {
  if (error) {
    try {
      const body = await error.context?.clone().json();
      if (typeof body?.error === 'string') return { success: false, error: body.error };
    } catch { /* Network errors may not have a JSON response. */ }
    return { success: false, error: "Checkout couldn't be confirmed. Please try again." };
  }
  if (data?.isMock || data?.error || typeof data?.url !== 'string') {
    return { success: false, error: typeof data?.error === 'string' ? data.error : 'No confirmed checkout was returned.' };
  }
  try {
    const url = new URL(data.url);
    if (url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password) {
      return { success: true, url: url.href };
    }
  } catch { /* Reject malformed links rather than navigating. */ }
  return { success: false, error: 'Invalid checkout destination. No redirect was made.' };
}
