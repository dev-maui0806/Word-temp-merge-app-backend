import dayjs from 'dayjs';
import { stripe, PLANS, GRACE_PERIOD_DAYS } from '../config/stripe.js';
import User from '../models/User.js';

/**
 * Stripe subscription service.
 * Plans: Monthly ₹799, Quarterly ₹2,099, Yearly ₹6,999
 * - Activates subscription immediately on checkout
 * - 3-day grace period before downgrade
 * - Expiry downgrade to 'expired' status
 */
export const stripeService = {
  /**
   * Create Stripe Checkout session for subscription.
   * @param {string} userId - User ID
   * @param {string} plan - 'monthly' | 'quarterly' | 'yearly'
   * @param {string} successUrl
   * @param {string} cancelUrl
   * @returns {Promise<{ url: string }>}
   */
  async createCheckoutSession(userId, plan, successUrl, cancelUrl) {
    const planConfig = PLANS[plan];
    if (!planConfig || !planConfig.priceId) {
      throw new Error(`Invalid plan: ${plan}. Set STRIPE_PRICE_* in .env`);
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const sessionConfig = {
      mode: 'subscription',
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId: userId.toString(), plan },
      subscription_data: {
        metadata: { userId: userId.toString(), plan },
        trial_period_days: 0,
      },
    };

    if (user.stripeCustomerId) {
      sessionConfig.customer = user.stripeCustomerId;
    } else {
      sessionConfig.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return { url: session.url };
  },

  /**
   * Activate subscription: set status to 'active', update expiry.
   */
  async activateSubscription(userId, subscription) {
    const periodEnd = subscription.current_period_end;
    const expiry = dayjs.unix(periodEnd).toDate();
    const planFromMetadata = subscription.metadata?.plan;

    await User.findByIdAndUpdate(userId, {
      subscriptionStatus: 'active',
      subscriptionExpiry: expiry,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      ...(planFromMetadata && { subscriptionPlan: planFromMetadata }),
    });
  },

  /**
   * Downgrade to expired (after grace period).
   */
  async downgradeToExpired(userId) {
    await User.findByIdAndUpdate(userId, {
      subscriptionStatus: 'expired',
      stripeSubscriptionId: null,
    });
  },

  /**
   * Check if user is within grace period (expired but not yet downgraded).
   */
  isInGracePeriod(subscriptionExpiry) {
    if (!subscriptionExpiry) return false;
    const expiry = dayjs(subscriptionExpiry);
    const graceEnd = expiry.add(GRACE_PERIOD_DAYS, 'day');
    return dayjs().isBefore(graceEnd) && dayjs().isAfter(expiry);
  },

  /**
   * Apply expiry downgrade logic: if past grace period, set status to expired.
   */
  async applyExpiryDowngrade(user) {
    if (user.subscriptionStatus !== 'active') return;
    if (!user.subscriptionExpiry) return;

    const expiry = dayjs(user.subscriptionExpiry);
    const graceEnd = expiry.add(GRACE_PERIOD_DAYS, 'day');

    if (dayjs().isAfter(graceEnd)) {
      await this.downgradeToExpired(user._id);
    }
  },

  /**
   * Run expiry downgrade for all users past grace period. Call from cron or on startup.
   */
  async runExpiryDowngrades() {
    const users = await User.find({
      subscriptionStatus: 'active',
      subscriptionExpiry: { $exists: true, $ne: null },
    });

    for (const user of users) {
      await this.applyExpiryDowngrade(user);
    }
  },

  /**
   * Handle Stripe webhook events.
   */
  async handleWebhookEvent(event) {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') return;

        const userId = session.metadata?.userId;
        if (!userId) return;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription,
          { expand: ['items.data.price.product'] }
        );

        await this.activateSubscription(userId, subscription);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        if (!userId) return;

        const periodEnd = subscription.current_period_end;
        const expiry = dayjs.unix(periodEnd).toDate();
         const planFromMetadata = subscription.metadata?.plan;

        await User.findByIdAndUpdate(userId, {
          subscriptionExpiry: expiry,
          subscriptionStatus:
            subscription.status === 'active' ? 'active' : 'expired',
          ...(planFromMetadata && { subscriptionPlan: planFromMetadata }),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        if (!userId) return;

        const periodEnd = subscription.current_period_end;
        const expiry = dayjs.unix(periodEnd).toDate();

        await User.findByIdAndUpdate(userId, {
          subscriptionExpiry: expiry,
          stripeSubscriptionId: null,
          subscriptionStatus: 'active',
          ...(subscription.metadata?.plan && {
            subscriptionPlan: subscription.metadata.plan,
          }),
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) return;

        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId
        );
        const userId = subscription.metadata?.userId;
        if (!userId) return;

        // Start grace: subscription stays active, Stripe retries.
        // If Stripe eventually cancels, customer.subscription.deleted fires.
        break;
      }

      default:
        break;
    }
  },
};
