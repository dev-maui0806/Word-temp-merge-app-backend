import { stripeService } from '../services/stripe.service.js';

export async function createCheckout(req, res) {
  try {
    const { plan, successUrl, cancelUrl } = req.body;
    const userId = req.user?.id ?? req.userId ?? req.body.userId;

    if (!userId || !plan || !successUrl || !cancelUrl) {
      return res.status(400).json({
        error: 'Missing required fields: userId, plan, successUrl, cancelUrl',
      });
    }

    const { url } = await stripeService.createCheckoutSession(
      userId,
      plan,
      successUrl,
      cancelUrl
    );

    res.json({ url });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = req.stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    await stripeService.handleWebhookEvent(event);
  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  res.json({ received: true });
}
