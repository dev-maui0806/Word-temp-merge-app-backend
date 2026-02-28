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

// PhonePe server-to-server callback
export async function handleCallback(req, res) {
  try {
    const xVerify = req.headers['x-verify'];
    const { response } = req.body || {};
    await phonepeService.handleCallback({ xVerify, responseB64: response });
    res.json({ ok: true });
  } catch (err) {
    // Return 200 even on verification errors to avoid repeated retries storm,
    // but log for diagnosis.
    console.error('PhonePe callback error:', err.message);
    res.status(200).json({ ok: false });
  }
}

