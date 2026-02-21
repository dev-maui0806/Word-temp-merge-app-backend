import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

/**
 * Middleware: attach raw body and Stripe instance for webhook signature verification.
 * Must be used with express.raw({ type: 'application/json' }) before this.
 */
export function stripeWebhookParser(req, res, next) {
  req.rawBody = req.body;
  req.stripe = stripe;
  next();
}
