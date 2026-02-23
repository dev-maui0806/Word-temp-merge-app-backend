import { resolveCountryData } from '../utils/resolveCountryData.js';
import { formatDateOfFR, formatEventDate, deriveEventDay } from '../utils/dateFormatters.js';
import { runTimeAutomation } from '../utils/timeAutomation.js';
import { enforceTimeFormat } from '../utils/enforceTimeFormat.js';
import { convertKmToMiles } from '../utils/convertKmToMiles.js';
import { resolveMeetingType } from '../utils/resolveMeetingType.js';

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
 * @returns {Object} Sanitized object with only allowed variables and exact casing
 * @throws {Error} If any required variable is missing
 */
export function validateArrangeVenueVariables(input) {
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
        missing.push(key);
        continue;
      }
      sanitized[key] = value;
      continue;
    }

    if (value === undefined || value === null || value === '') {
      missing.push(key);
      continue;
    }

    sanitized[key] = value;
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required variables: ${missing.join(', ')}`
    );
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
 * @returns {Object} Validated data with exact casing
 */
export async function runArrangeVenueAutomations(input) {
  const data = { ...input };

  const country = input.Country ?? input.country;
  if (country) {
    try {
      Object.assign(data, await resolveCountryData(country));
    } catch (err) {
      console.warn(`Failed to resolve country data for ${country}:`, err.message);
    }
  }

  if (input.Start_Time_For_Booking_Venue) {
    Object.assign(data, runTimeAutomation(input.Start_Time_For_Booking_Venue));
  }

  if (input.Event_Date) {
    data.Date_of_FR = formatDateOfFR(input.Event_Date);
    data.Event_Date = formatEventDate(input.Event_Date);
    data.Event_Day = deriveEventDay(input.Event_Date);
  }

  if (input.Distance_In_Kilometres != null) {
    data.Distance_In_Miles = convertKmToMiles(input.Distance_In_Kilometres);
  }

  if (input.Meeting_Type != null) {
    data.Meeting_Type = resolveMeetingType(input.Meeting_Type);
  }

  for (const key of TIME_VARS) {
    if (data[key] != null && typeof data[key] === 'string' && !data[key].includes('h')) {
      data[key] = enforceTimeFormat(data[key]);
    }
  }

  return validateArrangeVenueVariables(data);
}
