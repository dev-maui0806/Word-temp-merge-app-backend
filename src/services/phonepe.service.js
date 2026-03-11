/**
 * PhonePe Payment Gateway V2 Service.
 * Uses Client ID + Client Secret for OAuth, /checkout/v2/pay for payment creation.
 */

import crypto from 'node:crypto';
import dayjs from 'dayjs';
import { PHONEPE } from '../config/phonepe.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import User from '../models/User.js';
import { getEffectivePlanConfig } from './subscriptionPlan.service.js';

let tokenCache = { accessToken: null, expiresAt: 0 };

function getAppOrigin() {
  return (process.env.APP_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function phonepeHeaders(extra = {}) {
  // PhonePe endpoints sit behind Cloudflare; a missing/empty User-Agent can trigger 403 blocks.
  return {
    Accept: 'application/json',
    'User-Agent': process.env.PHONEPE_USER_AGENT || 'fieldagentreport/1.0',
    ...extra,
  };
}

function makeMerchantOrderId() {
  const ts = Date.now().toString();
  const rnd = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  return `TX_${ts}_${rnd}`.slice(0, 63);
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
    headers: phonepeHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
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

function normalizeAuthHeader(authHeader) {
  const raw = String(authHeader || '').trim();
  // Some docs/systems prefix with "SHA256", others send only the hex hash.
  return raw.replace(/^SHA256\s*/i, '').trim().toLowerCase();
}

function mapPhonePeStateToTxnStatus(state) {
  const s = String(state || '').toUpperCase();
  if (s === 'COMPLETED') return 'SUCCESS';
  if (s === 'FAILED') return 'FAILED';
  return 'INITIATED';
}

async function activateSubscriptionFromTxn(txn) {
  const planCfg = await getEffectivePlanConfig(txn.plan);
  const expiry = dayjs().add(planCfg.months, 'month').toDate();
  await User.findByIdAndUpdate(txn.userId, {
    subscriptionStatus: 'active',
    subscriptionPlan: txn.plan,
    subscriptionExpiry: expiry,
  });
}

export const phonepeService = {
  assertConfigured() {
    if (PHONEPE.mode === 'MOCK') return;
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

    const planCfg = await getEffectivePlanConfig(plan);
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

    const redirectUrl = `${getAppOrigin()}/checkout?transactionId=${encodeURIComponent(merchantOrderId)}`;

    // MOCK mode: skip PhonePe and return to app for simulated completion.
    if (PHONEPE.mode === 'MOCK') {
      const url = `${redirectUrl}&mock=1`;
      return { url, transactionId: merchantOrderId };
    }

    const accessToken = await getAccessToken();

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
        ...phonepeHeaders({
          'Content-Type': 'application/json',
          Authorization: `O-Bearer ${accessToken}`,
        }),
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
   * Fetch order status from PhonePe (recommended fallback if webhook is delayed/missed).
   */
  async fetchOrderStatus({ merchantOrderId }) {
    this.assertConfigured();
    if (!merchantOrderId) throw new Error('merchantOrderId required');

    if (PHONEPE.mode === 'MOCK') {
      const txn = await PaymentTransaction.findOne({ provider: 'phonepe', transactionId: merchantOrderId });
      if (!txn) throw new Error('Transaction not found');
      return { state: txn.paymentState || (txn.status === 'SUCCESS' ? 'COMPLETED' : txn.status === 'FAILED' ? 'FAILED' : 'PENDING') };
    }

    const accessToken = await getAccessToken();
    const url = `${PHONEPE.orderStatusBaseUrl}/${encodeURIComponent(merchantOrderId)}/status?details=false&errorContext=true`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...phonepeHeaders({
          'Content-Type': 'application/json',
          Authorization: `O-Bearer ${accessToken}`,
        }),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(data.message || data.code || '').trim();
      // PhonePe sandbox occasionally returns 5xx with internal simulator errors
      // when a user exits the PayPage without making any attempt. Treat as pending.
      if (
        res.status >= 500 ||
        msg.includes('java.util.List.stream') ||
        msg.includes('simulator') ||
        msg.includes('Access denied')
      ) {
        return { state: 'PENDING', warning: 'PhonePe status temporarily unavailable' };
      }
      throw new Error(msg || `PhonePe order status failed (${res.status})`);
    }
    return data;
  },

  /**
   * Sync local transaction status using PhonePe Order Status API.
   * Safe to call repeatedly (idempotent).
   */
  async syncTransactionStatus({ merchantOrderId }) {
    const txn = await PaymentTransaction.findOne({ provider: 'phonepe', transactionId: merchantOrderId });
    if (!txn) throw new Error('Transaction not found');

    const status = await this.fetchOrderStatus({ merchantOrderId });
    const state = status?.state;
    if (state) {
      txn.paymentState = state;
      txn.status = mapPhonePeStateToTxnStatus(state);
      txn.rawCallback = status;
      await txn.save();
    }

    if (txn.status === 'SUCCESS') {
      await activateSubscriptionFromTxn(txn);
    }

    return txn;
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
    const received = normalizeAuthHeader(authHeader);
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
    const newStatus = mapPhonePeStateToTxnStatus(state);

    txn.paymentState = state;
    txn.providerReferenceId = payload.orderId || txn.providerReferenceId;
    txn.rawCallback = body;
    txn.status = newStatus;
    await txn.save();

    if (txn.status === 'SUCCESS') {
      await activateSubscriptionFromTxn(txn);
    }

    return { ok: true };
  },

  /**
   * MOCK-only helper to simulate a callback without PhonePe.
   */
  async mockSettle({ merchantOrderId, state }) {
    if (PHONEPE.mode !== 'MOCK') {
      throw new Error('Mock settle is disabled (PHONEPE_MODE must be MOCK)');
    }
    const txn = await PaymentTransaction.findOne({ provider: 'phonepe', transactionId: merchantOrderId });
    if (!txn) throw new Error('Transaction not found');
    const normalized = String(state || '').toUpperCase();
    txn.paymentState = normalized;
    txn.status = mapPhonePeStateToTxnStatus(normalized);
    txn.rawCallback = { mock: true, state: normalized };
    await txn.save();
    if (txn.status === 'SUCCESS') {
      await activateSubscriptionFromTxn(txn);
    }
    return txn;
  },
};
