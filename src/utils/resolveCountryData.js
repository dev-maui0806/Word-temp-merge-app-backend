import Country from '../models/Country.js';
import CountryTimezone from '../models/CountryTimezone.js';

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
 * For single time zone countries, use country fields; for multiple time zone countries,
 * timezoneId is required and resolution uses the selected city/timezone row.
 * @param {string} country - Country name (e.g. India, UAE) or code (e.g. IN, US)
 * @param {string} [timezoneId] - Required when country has multiple time zones (e.g. selected city/timezone _id)
 * @returns {Promise<Object>} { Country_Standard_Time, Country_Code, Country_Standard_Time_Short, COUNTRY_CURRENCY_SHORT_NAME }
 */
export async function resolveCountryData(country, timezoneId) {
  if (!country || typeof country !== 'string') {
    throw new Error('Country must be a non-empty string');
  }

  const normalized = country.trim();

  try {
    const countryDoc = await Country.findOne({
      $or: [{ name: normalized }, { code: normalized }],
    }).lean();

    if (countryDoc) {
      if (!countryDoc.hasMultipleTimezones) {
        if (!countryDoc.standardTime || !countryDoc.countryCode || !countryDoc.timeShort || !countryDoc.currency) {
          console.warn(
            `resolveCountryData: country "${normalized}" has single TZ but missing fields, using fallback if any`
          );
        }
        return {
          Country_Standard_Time: countryDoc.standardTime || '',
          Country_Code: countryDoc.countryCode || '',
          Country_Standard_Time_Short: countryDoc.timeShort || '',
          COUNTRY_CURRENCY_SHORT_NAME: countryDoc.currency || '',
        };
      }

      // Multiple time zones: require timezoneId
      if (!timezoneId || typeof timezoneId !== 'string') {
        throw new Error(
          `Country "${normalized}" has multiple time zones; please select a city/time zone.`
        );
      }

      const tzDoc = await CountryTimezone.findOne({
        _id: timezoneId,
        country: countryDoc._id,
      }).lean();

      if (!tzDoc) {
        throw new Error(`Selected city/time zone not found for country "${normalized}".`);
      }

      return {
        Country_Standard_Time: tzDoc.standardTime || countryDoc.standardTime || '',
        Country_Code: tzDoc.countryCode || countryDoc.countryCode || '',
        Country_Standard_Time_Short: tzDoc.timeShort || countryDoc.timeShort || '',
        COUNTRY_CURRENCY_SHORT_NAME: tzDoc.currency || countryDoc.currency || '',
      };
    }
  } catch (err) {
    if (err.message && (err.message.includes('multiple time zones') || err.message.includes('not found'))) {
      throw err;
    }
    console.warn('resolveCountryData DB lookup failed:', err.message);
  }

  const fallback = FALLBACK_DATA[normalized];
  if (fallback) {
    return { ...fallback };
  }

  const supported = Object.keys(FALLBACK_DATA).join(', ');
  throw new Error(`Unsupported country: "${country}". Supported: ${supported}`);
}
