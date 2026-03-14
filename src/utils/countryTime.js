import Country from '../models/Country.js';
import CountryTimezone from '../models/CountryTimezone.js';

// Fallback representative IANA time zone per country code/name when DB is missing it.
const COUNTRY_CODE_TO_IANA = {
  IN: 'Asia/Kolkata',
  AE: 'Asia/Dubai',
  AU: 'Australia/Sydney',
  US: 'America/New_York',
  BR: 'America/Sao_Paulo',
  GB: 'Europe/London',
  CA: 'America/Toronto',
  PH: 'Asia/Manila',
};

function resolveIanaFromCountryDoc(countryDoc) {
  if (!countryDoc) return null;
  if (countryDoc.ianaTimeZone) return countryDoc.ianaTimeZone;
  if (countryDoc.code && COUNTRY_CODE_TO_IANA[countryDoc.code]) {
    return COUNTRY_CODE_TO_IANA[countryDoc.code];
  }
  const name = (countryDoc.name || '').toLowerCase();
  if (name === 'india') return COUNTRY_CODE_TO_IANA.IN;
  if (name === 'brazil') return COUNTRY_CODE_TO_IANA.BR;
  if (name === 'united arab emirates' || name === 'uae') return COUNTRY_CODE_TO_IANA.AE;
  if (name === 'united states' || name === 'usa') return COUNTRY_CODE_TO_IANA.US;
  if (name === 'united kingdom' || name === 'uk') return COUNTRY_CODE_TO_IANA.GB;
  if (name === 'philippines') return COUNTRY_CODE_TO_IANA.PH;
  return null;
}

export async function getCurrentCountryTime(countryInput, timezoneId) {
  if (!countryInput || typeof countryInput !== 'string') {
    throw new Error('country is required');
  }

  const normalized = countryInput.trim();

  const countryDoc = await Country.findOne({
    $or: [{ name: normalized }, { code: normalized }],
  }).lean();

  if (!countryDoc) {
    throw new Error(`Country "${normalized}" not found`);
  }

  let tzDoc = null;
  if (countryDoc.hasMultipleTimezones) {
    if (!timezoneId) {
      throw new Error(
        `Country "${countryDoc.name}" has multiple time zones; please select a city/time zone.`
      );
    }
    tzDoc = await CountryTimezone.findOne({
      _id: timezoneId,
      country: countryDoc._id,
    }).lean();
    if (!tzDoc) {
      throw new Error(`Selected city/time zone not found for country "${countryDoc.name}".`);
    }
  }

  const standardTime = tzDoc?.standardTime || countryDoc.standardTime || '';
  const timeShort = tzDoc?.timeShort || countryDoc.timeShort || '';

  const iana =
    tzDoc?.ianaTimeZone || resolveIanaFromCountryDoc(countryDoc) || 'UTC';

  let localDate = new Date();
  try {
    const str = new Date().toLocaleString('en-US', { timeZone: iana });
    localDate = new Date(str);
  } catch {
    // keep default
  }

  const hour = localDate.getHours();
  const greeting =
    hour < 12 ? 'Good Morning,' : hour < 18 ? 'Good Afternoon,' : 'Good Evening,';

  // Format date as "Sunday, 15 March 2026" without relying on frontend
  const formatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: iana,
  });

  const formattedDate = formatter.format(localDate);

  return {
    ok: true,
    country: countryDoc.name,
    countryCode: countryDoc.code,
    hasMultipleTimezones: !!countryDoc.hasMultipleTimezones,
    timezoneId: tzDoc?._id?.toString() || null,
    cityName: tzDoc?.cityName || null,
    standardTime,
    timeShort,
    ianaTimeZone: iana,
    greeting,
    formattedDate,
  };
}

