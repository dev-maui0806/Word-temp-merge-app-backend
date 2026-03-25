import { resolveCountryData } from '../utils/resolveCountryData.js';
import { getCurrentCountryTime } from '../utils/countryTime.js';
import { formatDateOfFR, formatEventDate, deriveEventDay } from '../utils/dateFormatters.js';
import { runTimeAutomation } from '../utils/timeAutomation.js';
import { enforceTimeFormat } from '../utils/enforceTimeFormat.js';
import { convertKmToMiles } from '../utils/convertKmToMiles.js';
import { resolveMeetingType } from '../utils/resolveMeetingType.js';
import { collectDateOfFRKeys } from '../utils/dateOfFRVariable.js';

const allowedVariables = [
  'Date_of_FR',
  'Claimant_Name',
  'Event_Type',
  'Event_Date',
  'Event_Time',
  'Country_Standard_Time',
  'Start_Time_For_Booking_Venue',
  'End_Time_For_Booking_Venue',
  'Venue_Name',
  'Country_Code',
  'Venue_Number',
  'Meeting_Type',
  'Country_Standard_Time_Short',
  'Venue_Address',
  'Event_Day',
  'Reception_Person_Name',
  'Distance_In_Kilometres',
  'Distance_In_Miles',
  'Start_Time_For_Report_Preparation',
  'End_Time_For_Report_Preparation',
  'Total_Time',
  'Service_Time',
  'COUNTRY_CURRENCY_SHORT_NAME',
];

/**
 * Validates input for the Arrange Venue template.
 * - Removes any variable not in allowedVariables list
 * - Throws error if any required variable is missing
 * - Enforces exact casing (keys must match allowedVariables exactly)
 * - Prevents placeholder mismatch by ensuring only valid variables pass through
 *
 * @param {Object} input - Raw input object (keys may have wrong casing)
 * @param {{ previewOnly?: boolean }} [options] - Controls strictness; preview relaxes required checks
 * @returns {Object} Sanitized object with only allowed variables and exact casing
 * @throws {Error} If any required variable is missing
 */
export function validateArrangeVenueVariables(input, options = {}) {
  const { previewOnly = false } = options;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Input must be a non-null object');
  }

  const sanitized = {};
  const missing = [];

  for (const key of allowedVariables) {
    const value = input[key];

    // Meeting_Type is allowed to be intentionally blank (e.g. "None")
    if (key === 'Meeting_Type') {
      if (value === undefined || value === null) {
        if (!previewOnly) {
          missing.push(key);
        }
        continue;
      }
      sanitized[key] = value;
      continue;
    }

    // In preview mode, treat missing/empty values as allowed (they will render as blank).
    if (value === undefined || value === null || value === '') {
      if (!previewOnly) {
        missing.push(key);
      }
      continue;
    }

    sanitized[key] = value;
  }

  if (!previewOnly && missing.length > 0) {
    throw new Error(`Missing required variables: ${missing.join(', ')}`);
  }

  return sanitized;
}

const TIME_VARS = [
  'Event_Time',
  'Start_Time_For_Booking_Venue',
  'End_Time_For_Booking_Venue',
  'Start_Time_For_Report_Preparation',
  'End_Time_For_Report_Preparation',
];

/**
 * Runs all automations and returns full validated data for Arrange Venue template.
 * @param {Object} input - Raw input (Country, Event_Date, Start_Time_For_Booking_Venue, etc.)
 * @param {{ previewOnly?: boolean }} [options] - Controls strictness; preview relaxes required checks
 * @returns {Object} Validated data with exact casing
 */
export async function runArrangeVenueAutomations(input, options = {}) {
  const { previewOnly = false } = options;
  const data = { ...input };

  const country = input.Country ?? input.country;
  const timezoneId = input.countryTimezoneId ?? input.CountryTimezoneId;
  if (country) {
    try {
      Object.assign(data, await resolveCountryData(country, timezoneId));
    } catch (err) {
      console.warn(`Failed to resolve country data for ${country}:`, err.message);
    }
  }

  if (input.Start_Time_For_Booking_Venue) {
    Object.assign(data, runTimeAutomation(input.Start_Time_For_Booking_Venue));
  }

  if (input.Event_Date) {
    data.Event_Date = formatEventDate(input.Event_Date);
    data.Event_Day = deriveEventDay(input.Event_Date);
  }

  // Date of FR (Date_of_FR or aliases): user value or country today
  const mergedForFr = { ...data, ...input };
  const frKeys = collectDateOfFRKeys(mergedForFr);
  const keysToWrite = frKeys.length > 0 ? frKeys : ['Date_of_FR'];

  let dateOfFRRaw = '';
  for (const k of keysToWrite) {
    const v = input[k] ?? data[k];
    if (v != null && String(v).trim()) {
      dateOfFRRaw = String(v).trim();
      break;
    }
  }

  let formattedFr = '';
  if (dateOfFRRaw) {
    formattedFr = formatDateOfFR(dateOfFRRaw);
  } else {
    try {
      if (country) {
        const ct = await getCurrentCountryTime(country, input.countryTimezoneId ?? input.CountryTimezoneId);
        if (ct?.isoDate) formattedFr = formatDateOfFR(ct.isoDate);
      }
    } catch (err) {
      console.warn('Could not resolve country time for Date_of_FR default:', err.message);
    }
    if (!formattedFr) {
      formattedFr = formatDateOfFR(new Date().toISOString().slice(0, 10));
    }
  }
  for (const k of keysToWrite) {
    data[k] = formattedFr;
  }

  if (input.Distance_In_Kilometres != null) {
    data.Distance_In_Miles = convertKmToMiles(input.Distance_In_Kilometres);
  }

  if (input.Meeting_Type != null) {
    data.Meeting_Type = resolveMeetingType(input.Meeting_Type);
  }

  for (const key of TIME_VARS) {
    // Only enforce time format when we actually have a non-empty value.
    if (
      data[key] != null &&
      typeof data[key] === 'string' &&
      data[key].trim() !== '' &&
      !data[key].includes('h')
    ) {
      data[key] = enforceTimeFormat(data[key]);
    }
  }

  return validateArrangeVenueVariables(data, { previewOnly });
}
