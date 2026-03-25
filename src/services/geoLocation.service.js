const GEO_TIMEOUT_MS = 3000;

function withTimeout(ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(t) };
}

function normalizeCountryName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (n.toLowerCase() === 'united states') return 'USA';
  if (n.toLowerCase() === 'united arab emirates') return 'UAE';
  return n;
}

export const geoLocationService = {
  async resolveCountryByIp(ip) {
    const safeIp = String(ip || '').trim();
    if (!safeIp) return null;

    // Skip private/local IPs.
    if (
      safeIp === '127.0.0.1' ||
      safeIp === '::1' ||
      safeIp.startsWith('10.') ||
      safeIp.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(safeIp)
    ) {
      return null;
    }

    const { signal, clear } = withTimeout(GEO_TIMEOUT_MS);
    try {
      const res = await fetch(`https://ipapi.co/${encodeURIComponent(safeIp)}/json/`, { signal });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (!data) return null;
      const country = normalizeCountryName(data.country_name || '');
      const countryCode = String(data.country_code || '').trim().toUpperCase();
      if (!country) return null;
      return { country, countryCode: countryCode || undefined };
    } catch {
      return null;
    } finally {
      clear();
    }
  },
};

