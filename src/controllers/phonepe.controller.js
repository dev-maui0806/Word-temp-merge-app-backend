import { phonepeService } from '../services/phonepe.service.js';

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
