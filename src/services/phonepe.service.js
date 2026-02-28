/**
 * PhonePe Payment Gateway V2 Service.
 * Uses Client ID + Client Secret for OAuth, /checkout/v2/pay for payment creation.
 */

import crypto from 'node:crypto';
import dayjs from 'dayjs';
import { PHONEPE, PLANS } from '../config/phonepe.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import User from '../models/User.js';

let tokenCache = { accessToken: null, expiresAt: 0 };

function getAppOrigin() {
  return (process.env.APP_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function makeMerchantOrderId() {
  const ts = Date.now().toString();
  const rnd = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  return `TX_${ts}_${rnd}`.slice(0, 63);
}

function getPlanConfig(plan) {
  const cfg = PLANS[plan];
  if (!cfg) throw new Error('Invalid plan');
  return cfg;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const bufferSeconds = 300; // refresh 5 min before expiry
  if (tokenCache.accessToken && tokenCache.expiresAt > now + bufferSeconds) {
    return tokenCache.accessToken;
  }

  const params = new URLSearchParams({
    client_id: PHONEPE.clientId,
    client_secret: PHONEPE.clientSecret,
    client_version: PHONEPE.clientVersion,
    grant_type: 'client_credentials',
  });

  const res = await fetch(PHONEPE.oauthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PhonePe OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const accessToken = data.access_token || data.encrypted_access_token;
  const expiresAt = data.expires_at || (data.issued_at || now) + (data.expires_in || 86400);

  if (!accessToken) throw new Error('PhonePe OAuth: no access_token in response');

  tokenCache = { accessToken, expiresAt };
  return accessToken;
}

export const phonepeService = {
  assertConfigured() {
    if (!PHONEPE.clientId) throw new Error('PHONEPE_CLIENT_ID not configured');
    if (!PHONEPE.clientSecret) throw new Error('PHONEPE_CLIENT_SECRET not configured');
  },

  /**
   * Create a PhonePe V2 checkout session and return redirect URL.
   */
  async createHostedCheckout({ userId, plan }) {
    this.assertConfigured();

    const user = await User.findById(userId).select('_id email name mobile');
    if (!user) throw new Error('User not found');

    const planCfg = getPlanConfig(plan);
    const amountPaise = planCfg.amountRupees * 100;
    const merchantOrderId = makeMerchantOrderId();

    await PaymentTransaction.create({
      provider: 'phonepe',
      transactionId: merchantOrderId,
      userId: user._id,
      plan,
      amountPaise,
      status: 'INITIATED',
    });

    const accessToken = await getAccessToken();
    const redirectUrl = `${getAppOrigin()}/settings?payment=processing`;

    const body = {
      merchantOrderId,
      amount: amountPaise,
      expireAfter: 1200,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: `Subscription ${planCfg.name}`,
        merchantUrls: {
          redirectUrl,
        },
      },
      metaInfo: {
        udf1: String(user._id),
        udf2: plan,
      },
    };

    const res = await fetch(PHONEPE.payUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `O-Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        data.message || data.code || `PhonePe checkout failed (${res.status})`
      );
    }

    const payRedirectUrl = data.redirectUrl;
    if (!payRedirectUrl) {
      throw new Error('PhonePe did not return redirectUrl');
    }

    return { url: payRedirectUrl, transactionId: merchantOrderId };
  },

  /**
   * Handle V2 webhook callback from PhonePe.
   * Configure webhook URL in PhonePe dashboard; use PHONEPE_WEBHOOK_USERNAME and PHONEPE_WEBHOOK_PASSWORD for verification.
   */
  async handleWebhook({ authHeader, body }) {
    if (!PHONEPE.webhookUsername || !PHONEPE.webhookPassword) {
      console.warn('PhonePe webhook: PHONEPE_WEBHOOK_USERNAME/PASSWORD not configured');
      return { ok: true };
    }

    const expectedHash = crypto
      .createHash('sha256')
      .update(`${PHONEPE.webhookUsername}:${PHONEPE.webhookPassword}`)
      .digest('hex')
      .toLowerCase();
    const received = String(authHeader || '').replace(/^SHA256\s*/i, '').trim().toLowerCase();
    if (received !== expectedHash) {
      throw new Error('Invalid webhook signature');
    }

    const event = body?.event;
    const payload = body?.payload;
    if (!event || !payload) {
      throw new Error('Missing event or payload');
    }

    const merchantOrderId = payload.merchantOrderId;
    if (!merchantOrderId) {
      return { ok: true };
    }

    const txn = await PaymentTransaction.findOne({
      provider: 'phonepe',
      transactionId: merchantOrderId,
    });
    if (!txn) {
      return { ok: true };
    }

    const state = payload.state;
    const isSuccess =
      event === 'checkout.order.completed' && state === 'COMPLETED';

    txn.paymentState = state;
    txn.providerReferenceId = payload.orderId || txn.providerReferenceId;
    txn.rawCallback = body;
    txn.status = isSuccess ? 'SUCCESS' : 'FAILED';
    await txn.save();

    if (isSuccess) {
      const planCfg = getPlanConfig(txn.plan);
      const expiry = dayjs().add(planCfg.months, 'month').toDate();
      await User.findByIdAndUpdate(txn.userId, {
        subscriptionStatus: 'active',
        subscriptionPlan: txn.plan,
        subscriptionExpiry: expiry,
      });
    }

    return { ok: true };
  },
};
