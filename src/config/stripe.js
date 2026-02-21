import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export const PLANS = {
  monthly: {
    name: 'Monthly',
    amount: 799,
    currency: 'inr',
    interval: 'month',
    priceId: process.env.STRIPE_PRICE_MONTHLY,
  },
  quarterly: {
    name: 'Quarterly',
    amount: 2099,
    currency: 'inr',
    interval: 'month',
    intervalCount: 3,
    priceId: process.env.STRIPE_PRICE_QUARTERLY,
  },
  yearly: {
    name: 'Yearly',
    amount: 6999,
    currency: 'inr',
    interval: 'year',
    priceId: process.env.STRIPE_PRICE_YEARLY,
  },
};

export const GRACE_PERIOD_DAYS = 3;
