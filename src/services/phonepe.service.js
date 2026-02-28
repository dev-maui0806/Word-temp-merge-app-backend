import crypto from 'node:crypto';
import dayjs from 'dayjs';
import { PHONEPE, PLANS } from '../config/phonepe.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import User from '../models/User.js';

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function base64Json(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
}

function getAppOrigin() {
  return (process.env.APP_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
}

function getApiOrigin() {
  // When deployed behind a proxy, set API_ORIGIN explicitly.
  return (process.env.API_ORIGIN || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

function makeMerchantTxId() {
  // <= 36 chars, alphanumeric + underscore only
  const ts = Date.now().toString();
  const rnd = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  return `TX_${ts}_${rnd}`.slice(0, 36);
}

function getPlanConfig(plan) {
  const cfg = PLANS[plan];
  if (!cfg) throw new Error('Invalid plan');
  return cfg;
}

export const phonepeService = {
  assertConfigured() {
    if (!PHONEPE.merchantId) throw new Error('PHONEPE_MERCHANT_ID not configured');
    if (!PHONEPE.saltKey) throw new Error('PHONEPE_SALT_KEY not configured');
    if (!PHONEPE.saltIndex) throw new Error('PHONEPE_SALT_INDEX not configured');
  },

  /**
   * Create a PhonePe hosted-payment redirect URL (Accept Payments v3).
   */
  async createHostedCheckout({ userId, plan }) {
    this.assertConfigured();

    const user = await User.findById(userId).select('_id email name mobile');
    if (!user) throw new Error('User not found');

    const planCfg = getPlanConfig(plan);
    const amountPaise = planCfg.amountRupees * 100;
    const transactionId = makeMerchantTxId();

    await PaymentTransaction.create({
      provider: 'phonepe',
      transactionId,
      userId: user._id,
      plan,
      amountPaise,
      status: 'INITIATED',
    });

    const payload = {
      merchantId: PHONEPE.merchantId,
      transactionId,
      merchantUserId: String(user._id),
      amount: amountPaise,
      merchantOrderId: transactionId,
      mobileNumber: user.mobile || undefined,
      email: user.email || undefined,
      message: `Subscription ${planCfg.name}`,
      shortName: user.name || user.email?.split('@')[0] || 'User',
    };

    const requestB64 = base64Json(payload);
    const apiPath = '/v3/debit';
    const xVerify = `${sha256Hex(requestB64 + apiPath + PHONEPE.saltKey)}###${PHONEPE.saltIndex}`;

    const callbackUrl = `${getApiOrigin()}/api/payments/phonepe/callback`;
    const redirectUrl = `${getAppOrigin()}/settings?payment=processing`;

    const headers = {
      'Content-Type': 'application/json',
      'X-VERIFY': xVerify,
      'X-REDIRECT-URL': redirectUrl,
      'X-REDIRECT-MODE': 'REDIRECT',
      'X-CALLBACK-URL': callbackUrl,
      'X-CALL-MODE': 'POST',
    };
    if (PHONEPE.providerId) headers['X-PROVIDER-ID'] = PHONEPE.providerId;

    const res = await fetch(`${PHONEPE.apiBaseUrl}${apiPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ request: requestB64 }),
      redirect: 'manual',
    });

    // PhonePe responds with 302 + Location header containing /transact?token=...
    const location = res.headers.get('location') || res.headers.get('Location');
    if (!location) {
      const text = await res.text().catch(() => '');
      throw new Error(`PhonePe checkout failed (status ${res.status}) ${text}`.trim());
    }

    const url = location.startsWith('http') ? location : `${PHONEPE.redirectHost}${location}`;
    return { url, transactionId };
  },

  /**
   * Handle server-to-server callback from PhonePe.
   * Expects: { response: "<base64>" }
   */
  async handleCallback({ xVerify, responseB64 }) {
    this.assertConfigured();
    if (!responseB64 || typeof responseB64 !== 'string') {
      throw new Error('Missing callback response');
    }

    const expectedPrefix = `${sha256Hex(responseB64 + PHONEPE.saltKey)}###${PHONEPE.saltIndex}`;
    const normalized = String(xVerify || '').trim();
    if (!normalized || normalized !== expectedPrefix) {
      throw new Error('Invalid callback signature');
    }

    const decodedJson = JSON.parse(Buffer.from(responseB64, 'base64').toString('utf8'));
    const txId = decodedJson?.data?.transactionId;
    if (!txId) throw new Error('Callback missing transactionId');

    const txn = await PaymentTransaction.findOne({ provider: 'phonepe', transactionId: txId });
    if (!txn) {
      // Best-effort: ignore unknown tx (could be old) but don't crash callback retries.
      return { ok: true };
    }

    const code = decodedJson?.code;
    const paymentState = decodedJson?.data?.paymentState;
    const providerReferenceId = decodedJson?.data?.providerReferenceId;
    const payResponseCode = decodedJson?.data?.payResponseCode;

    const isSuccess =
      code === 'PAYMENT_SUCCESS' &&
      (paymentState === 'COMPLETED' || paymentState === 'COMPLETED '); // defensive

    txn.providerReferenceId = providerReferenceId || txn.providerReferenceId;
    txn.paymentState = paymentState || txn.paymentState;
    txn.payResponseCode = payResponseCode || txn.payResponseCode;
    txn.rawCallback = decodedJson;
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

