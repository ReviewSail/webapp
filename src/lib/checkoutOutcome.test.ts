import { describe, expect, it } from 'vitest';
import { checkoutOutcome } from './checkoutOutcome';

describe('checkout handoff', () => {
  it('accepts a genuine HTTPS Stripe checkout link', async () => {
    expect(await checkoutOutcome({ url: 'https://checkout.stripe.com/c/pay/test' }, null)).toEqual({
      success: true, url: 'https://checkout.stripe.com/c/pay/test',
    });
  });
  it('surfaces the missing-Stripe message from a non-2xx response', async () => {
    expect(await checkoutOutcome(null, { context: new Response(JSON.stringify({ error: "Payments aren't set up yet." })) }))
      .toEqual({ success: false, error: "Payments aren't set up yet." });
  });
  for (const url of ['javascript:alert(1)', 'http://checkout.stripe.com/test', 'https://evil.example/test',
    'https://checkout.stripe.com.evil.example/test', 'https://person:password@checkout.stripe.com/test', '/dashboard?mock_checkout_success=true']) {
    it(`rejects unsafe destination ${url}`, async () => {
      expect((await checkoutOutcome({ url }, null)).success).toBe(false);
    });
  }
  it('rejects mock success even with an otherwise trusted URL', async () => {
    expect((await checkoutOutcome({ isMock: true, url: 'https://checkout.stripe.com/test' }, null)).success).toBe(false);
  });
  it('does not treat a network failure or empty response as successful', async () => {
    expect((await checkoutOutcome(null, new Error('network'))).success).toBe(false);
    expect((await checkoutOutcome({}, null)).success).toBe(false);
  });
});
