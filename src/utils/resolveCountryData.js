import Country from '../models/Country.js';

/** Fallback data when DB lookup fails (e.g. migration not run) */
const FALLBACK_DATA = {
  India: {
    Country_Standard_Time: 'Indian Standard Time (IST)',
    Country_Code: '+91',
    Country_Standard_Time_Short: 'IST',
    COUNTRY_CURRENCY_SHORT_NAME: 'INR',
  },
  UAE: {
    Country_Standard_Time: 'Gulf Standard Time (GST)',
    Country_Code: '+971',
    Country_Standard_Time_Short: 'GST',
    COUNTRY_CURRENCY_SHORT_NAME: 'AED',
  },
  Australia: {
    Country_Standard_Time: 'Australian Eastern Standard Time (AEST)',
    Country_Code: '+61',
    Country_Standard_Time_Short: 'AEST',
    COUNTRY_CURRENCY_SHORT_NAME: 'AUD',
  },
};

/**
 * Resolves country-specific data from the database.
 * Falls back to hardcoded data if DB lookup fails.
 * @param {string} country - Country name (e.g. India, UAE)
 * @returns {Promise<Object>} { Country_Standard_Time, Country_Code, Country_Standard_Time_Short, COUNTRY_CURRENCY_SHORT_NAME }
 */
export async function resolveCountryData(country) {
  if (!country || typeof country !== 'string') {
    throw new Error('Country must be a non-empty string');
  }

  const normalized = country.trim();

  try {
    const doc = await Country.findOne({
      $or: [{ name: normalized }, { code: normalized }],
    }).lean();

    if (doc) {
      return {
        Country_Standard_Time: doc.standardTime,
        Country_Code: doc.countryCode,
        Country_Standard_Time_Short: doc.timeShort,
        COUNTRY_CURRENCY_SHORT_NAME: doc.currency,
      };
    }
  } catch (err) {
    console.warn('resolveCountryData DB lookup failed:', err.message);
  }

  const fallback = FALLBACK_DATA[normalized];
  if (fallback) {
    return { ...fallback };
  }

  const supported = Object.keys(FALLBACK_DATA).join(', ');
  throw new Error(`Unsupported country: "${country}". Supported: ${supported}`);
}
