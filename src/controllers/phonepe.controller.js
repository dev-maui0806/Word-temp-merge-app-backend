import { phonepeService } from '../services/phonepe.service.js';
import { getAllPlansWithOverrides } from '../services/subscriptionPlan.service.js';
import PaymentTransaction from '../models/PaymentTransaction.js';

export async function createCheckout(req, res) {
  try {
    const userId = req.user?.id ?? req.userId;
    const { plan } = req.body;
    if (!userId || !plan) {
      return res.status(400).json({ error: 'Missing required fields: plan' });
    }

    const { url, transactionId } = await phonepeService.createHostedCheckout({ userId, plan });
    res.json({ url, transactionId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * PhonePe V2 Webhook - configured in PhonePe dashboard.
 * Expects JSON body: { event, payload }.
 * Authorization header: SHA256 hash of (webhook_username:webhook_password).
 */
export async function handleCallback(req, res) {
  try {
    const authHeader = req.headers.authorization;
    const body = req.body || {};
    await phonepeService.handleWebhook({ authHeader, body });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('PhonePe webhook error:', err.message);
    res.status(200).json({ ok: false });
  }
}

export async function getOrderStatus(req, res) {
  try {
    const userId = req.user?.id ?? req.userId;
    const merchantOrderId = req.params.merchantOrderId;
    if (!userId || !merchantOrderId) {
      return res.status(400).json({ error: 'Missing merchantOrderId' });
    }

    // Fetch local txn first (ownership + fallback if PhonePe status has intermittent errors)
    const existing = await PaymentTransaction.findOne({
      provider: 'phonepe',
      transactionId: merchantOrderId,
    });
    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (String(existing.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    let txn = existing;
    let warning;
    try {
      txn = await phonepeService.syncTransactionStatus({ merchantOrderId });
      // If sync stored a warning into rawCallback, surface a friendly hint.
      if (txn?.rawCallback?.warning) warning = txn.rawCallback.warning;
    } catch (err) {
      // Never bubble PhonePe sandbox/internal errors to end users.
      warning = 'Payment confirmation is taking longer than usual. If you cancelled, you can retry.';
    }

    res.json({
      transactionId: txn.transactionId,
      status: txn.status,
      paymentState: txn.paymentState || null,
      plan: txn.plan,
      amountPaise: txn.amountPaise,
      updatedAt: txn.updatedAt,
      ...(warning ? { warning } : {}),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function mockSettle(req, res) {
  try {
    const userId = req.user?.id ?? req.userId;
    const { merchantOrderId, state } = req.body || {};
    if (!userId || !merchantOrderId || !state) {
      return res.status(400).json({ error: 'Missing required fields: merchantOrderId, state' });
    }

    const txn = await phonepeService.mockSettle({ merchantOrderId, state });
    if (String(txn.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json({ ok: true, status: txn.status, paymentState: txn.paymentState });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function listPlans(req, res) {
  try {
    const plans = await getAllPlansWithOverrides();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
