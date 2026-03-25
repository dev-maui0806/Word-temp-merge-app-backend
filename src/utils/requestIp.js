export function getClientIp(req) {
  const xfwd = req.headers['x-forwarded-for'];
  const fromForwarded = Array.isArray(xfwd) ? xfwd[0] : String(xfwd || '').split(',')[0];
  const raw =
    fromForwarded ||
    req.headers['x-real-ip'] ||
    req.headers['cf-connecting-ip'] ||
    req.socket?.remoteAddress ||
    '';

  const cleaned = String(raw || '').trim();
  if (!cleaned) return '';

  // Handle IPv6 loopback / IPv4-mapped format.
  if (cleaned === '::1') return '127.0.0.1';
  if (cleaned.startsWith('::ffff:')) return cleaned.slice(7);
  return cleaned;
}

