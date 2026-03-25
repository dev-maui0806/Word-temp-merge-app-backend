import { razorpayService } from '../services/razorpay.service.js';
import { getAllPlansWithOverrides } from '../services/subscriptionPlan.service.js';
import { currencyConversionService } from '../services/currencyConversion.service.js';

export async function listPlans(req, res) {
  try {
    const plans = await getAllPlansWithOverrides();
    const country = req.query.country ? String(req.query.country) : '';
    const timezoneId = req.query.timezoneId ? String(req.query.timezoneId) : '';
    const enriched = await currencyConversionService.enrichPlansWithLocalCurrency(plans, {
      country,
      timezoneId,
    });
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createOrder(req, res) {
  try {
    const userId = req.user?.id ?? req.userId;
    const { plan } = req.body || {};
    if (!userId || !plan) {
      return res.status(400).json({ error: 'Missing required fields: plan' });
    }
    const order = await razorpayService.createOrder({ userId, plan });
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function verifyPayment(req, res) {
  try {
    const userId = req.user?.id ?? req.userId;
    const { orderId, paymentId, signature } = req.body || {};
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const txn = await razorpayService.verifyPayment({ userId, orderId, paymentId, signature });
    res.json({
      ok: true,
      status: txn.status,
      transactionId: txn.transactionId,
    });
  } catch (err) {
    const isForbidden = err.message === 'Forbidden';
    res.status(isForbidden ? 403 : 400).json({ error: err.message });
  }
}

export async function getOrderStatus(req, res) {
  try {
    const userId = req.user?.id ?? req.userId;
    const orderId = req.params.orderId;
    if (!userId || !orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }
    const txn = await razorpayService.getOrderStatus({ userId, orderId });
    res.json({
      transactionId: txn.transactionId,
      status: txn.status,
      paymentState: txn.paymentState || null,
      plan: txn.plan,
      amountPaise: txn.amountPaise,
      updatedAt: txn.updatedAt,
    });
  } catch (err) {
    const status = err.message === 'Forbidden' ? 403 : 404;
    res.status(status).json({ error: err.message });
  }
}
