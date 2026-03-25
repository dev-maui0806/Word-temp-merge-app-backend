import Country from '../models/Country.js';
import CountryTimezone from '../models/CountryTimezone.js';

const CACHE_TTL_MS = 30 * 60 * 1000;
const ratesCache = new Map(); // key: INR->CUR

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function fetchFxRateInrTo(targetCurrency) {
  const cur = String(targetCurrency || '').toUpperCase().trim();
  if (!cur || cur === 'INR') return 1;

  const cached = ratesCache.get(cur);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const url = `https://api.exchangerate.host/convert?from=INR&to=${encodeURIComponent(cur)}&amount=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FX API failed (${res.status})`);
  const data = await res.json().catch(() => ({}));
  const rate = Number(data?.result);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid FX rate');

  ratesCache.set(cur, { rate, expiresAt: Date.now() + CACHE_TTL_MS });
  return rate;
}

async function resolveCountryCurrency({ country, timezoneId }) {
  if (!country) return 'INR';
  const raw = String(country).trim();
  const aliases = {
    'united states': 'USA',
    'united arab emirates': 'UAE',
    'united kingdom': 'UK',
  };
  const normalizedName = aliases[raw.toLowerCase()] || raw;
  const countryDoc = await Country.findOne({
    $or: [{ name: normalizedName }, { code: normalizedName.toUpperCase() }],
  }).lean();
  if (!countryDoc) return 'INR';

  if (countryDoc.hasMultipleTimezones && timezoneId) {
    const tz = await CountryTimezone.findById(timezoneId).lean();
    if (tz?.currency) return String(tz.currency).toUpperCase();
  }
  return String(countryDoc.currency || 'INR').toUpperCase();
}

export const currencyConversionService = {
  async enrichPlansWithLocalCurrency(plans, { country, timezoneId } = {}) {
    const localCurrency = await resolveCountryCurrency({ country, timezoneId });
    if (localCurrency === 'INR') {
      return plans.map((p) => ({
        ...p,
        localCurrency: 'INR',
        localAmount: p.amountRupees,
        fxRateInrToLocal: 1,
      }));
    }

    let rate = 1;
    try {
      rate = await fetchFxRateInrTo(localCurrency);
    } catch {
      // Fallback: still return INR values if FX API is unavailable.
      return plans.map((p) => ({
        ...p,
        localCurrency: 'INR',
        localAmount: p.amountRupees,
        fxRateInrToLocal: 1,
      }));
    }

    return plans.map((p) => ({
      ...p,
      localCurrency,
      localAmount: roundMoney(Number(p.amountRupees || 0) * rate),
      fxRateInrToLocal: rate,
    }));
  },
};

