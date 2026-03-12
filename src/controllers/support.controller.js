import { sendSupportEmail } from '../services/supportEmail.service.js';

// Very small in-memory rate limit (best-effort; per-instance).
const rate = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function isValidEmail(email) {
  const e = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function submitSupportMessage(req, res) {
  try {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = rate.get(ip) || { count: 0, start: now };
    if (now - entry.start > WINDOW_MS) {
      entry.count = 0;
      entry.start = now;
    }
    entry.count += 1;
    rate.set(ip, entry);
    if (entry.count > MAX_PER_WINDOW) {
      return res.status(429).json({ error: 'Too many messages. Please wait a moment and try again.' });
    }

    const { name, email, regarding, message, acceptTerms } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return res.status(400).json({ error: 'Message must be at least 10 characters.' });
    }
    if (acceptTerms !== true) {
      return res.status(400).json({ error: 'Please accept the Terms and Privacy Policy.' });
    }

    await sendSupportEmail({
      name: name.trim(),
      email: String(email).trim(),
      regarding: regarding ? String(regarding).trim() : 'other',
      message: message.trim(),
      ip,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to send message.' });
  }
}

