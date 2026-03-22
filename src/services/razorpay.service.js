import crypto from 'node:crypto';
import dayjs from 'dayjs';
import { RAZORPAY } from '../config/razorpay.js';
import PaymentTransaction from '../models/PaymentTransaction.js';
import User from '../models/User.js';
import { getEffectivePlanConfig } from './subscriptionPlan.service.js';

function assertConfigured() {
  if (!RAZORPAY.keyId) throw new Error('RAZORPAY_KEY_ID not configured');
  if (!RAZORPAY.keySecret) throw new Error('RAZORPAY_KEY_SECRET not configured');
}

function toBasicAuthHeader() {
  return `Basic ${Buffer.from(`${RAZORPAY.keyId}:${RAZORPAY.keySecret}`).toString('base64')}`;
}

function makeReceipt(userId, plan) {
  return `rcpt_${String(userId).slice(-8)}_${plan}_${Date.now()}`.slice(0, 40);
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

export const razorpayService = {
  async createOrder({ userId, plan }) {
    assertConfigured();
    const user = await User.findById(userId).select('_id email name mobile');
    if (!user) throw new Error('User not found');

    const planCfg = await getEffectivePlanConfig(plan);
    const amountPaise = planCfg.amountRupees * 100;

    const receipt = makeReceipt(user._id, plan);
    const res = await fetch(`${RAZORPAY.apiBaseUrl}/orders`, {
      method: 'POST',
      headers: {
        Authorization: toBasicAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          userId: String(user._id),
          plan,
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.description || data?.error?.reason || 'Failed to create Razorpay order';
      throw new Error(msg);
    }

    const orderId = data.id;
    if (!orderId) throw new Error('Razorpay order creation returned no order id');

    await PaymentTransaction.create({
      provider: 'razorpay',
      transactionId: orderId,
      userId: user._id,
      plan,
      amountPaise,
      status: 'INITIATED',
      rawCallback: { orderCreateResponse: data },
    });

    return {
      keyId: RAZORPAY.keyId,
      orderId,
      amountPaise,
      currency: data.currency || 'INR',
      name: 'Field Agent Report',
      description: `Subscription ${planCfg.name}`,
      prefill: {
        name: user.name || '',
        email: user.email || '',
        contact: user.mobile || '',
      },
    };
  },

  async verifyPayment({ userId, orderId, paymentId, signature }) {
    assertConfigured();
    if (!orderId || !paymentId || !signature) {
      throw new Error('Missing required fields: orderId, paymentId, signature');
    }

    const txn = await PaymentTransaction.findOne({ provider: 'razorpay', transactionId: orderId });
    if (!txn) throw new Error('Transaction not found');
    if (String(txn.userId) !== String(userId)) throw new Error('Forbidden');

    const expected = crypto
      .createHmac('sha256', RAZORPAY.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const isValid = expected === signature;
    if (!isValid) {
      txn.status = 'FAILED';
      txn.providerReferenceId = paymentId;
      txn.rawCallback = { ...(txn.rawCallback || {}), verifyRequest: { paymentId }, verifyResult: 'signature_mismatch' };
      await txn.save();
      throw new Error('Invalid Razorpay signature');
    }

    txn.status = 'SUCCESS';
    txn.providerReferenceId = paymentId;
    txn.paymentState = 'captured';
    txn.rawCallback = { ...(txn.rawCallback || {}), verifyRequest: { paymentId }, verifyResult: 'verified' };
    await txn.save();
    await activateSubscriptionFromTxn(txn);

    return txn;
  },

  async getOrderStatus({ userId, orderId }) {
    const txn = await PaymentTransaction.findOne({ provider: 'razorpay', transactionId: orderId });
    if (!txn) throw new Error('Transaction not found');
    if (String(txn.userId) !== String(userId)) throw new Error('Forbidden');
    return txn;
  },
};
