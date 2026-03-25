/**
 * Automation Runner: Runs the appropriate automation for each action type.
 * Delegates to action-specific services when available.
 */

import { runArrangeVenueAutomations } from './arrangeVenue.service.js';
import { resolveCountryData } from '../utils/resolveCountryData.js';
import { formatDateOfFR, formatEventDate, deriveEventDay } from '../utils/dateFormatters.js';
import { getCurrentCountryTime } from '../utils/countryTime.js';
import { collectDateOfFRKeys } from '../utils/dateOfFRVariable.js';
import { convertKmToMiles } from '../utils/convertKmToMiles.js';
import { runTimeAutomation } from '../utils/timeAutomation.js';
import { getTemplateConfig } from '../templates/templateRegistry.js';

const TIME_SEED_PRIORITY = [
  'Start_Time_For_Booking_Venue',
  'Start_Time_For_Cancel_Venue',
  'Start_Time_For_Cancel_Notary',
  'Start_Time_For_Cancel_Transportation',
  'Start_Time_For_Cancel_Accommodation',
  'Start_Time_For_Arrange_Transportation',
  'Start_Time_For_Arrange_Accommodation',
  'Start_Time_For_Arrange_accommodation',
  'Start_Time_For_Booking_Transportation',
  'Start_Time_For_Booking_Accommodation',
];

/**
 * Pick a non-empty HH:mm-style seed; prefer action-specific Start_Time_* before Event_Time.
 */
function pickStartTimeForAutomation(input) {
  if (!input || typeof input !== 'object') return null;
  for (const key of TIME_SEED_PRIORITY) {
    const v = input[key];
    if (v != null && typeof v === 'string' && v.trim()) return v.trim();
  }
  const startKeys = Object.keys(input).filter((k) => k.startsWith('Start_Time_'));
  startKeys.sort();
  for (const key of startKeys) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const et = input.Event_Time;
  if (et != null && String(et).trim()) return String(et).trim();
  return null;
}

/**
 * Run automation for an action. Returns data ready for template merge.
 * Common logic (country, dates, distance, time) runs for ALL action types
 * (arrange/cancel venue, transportation, accommodation, notary, ent-test, etc.).
 *
 * @param {string} actionSlug - e.g. 'arrange-venue', 'arrange-accommodation', 'cancel-notary'
 * @param {Object} input - Raw form data
 * @param {{ previewOnly?: boolean }} [options] - Flags to control strictness (e.g. relaxed rules for preview)
 * @returns {Promise<Object>} Processed data for DocxGenerator
 */
export async function runAutomation(actionSlug, input, options = {}) {
  const { previewOnly = false } = options;
  const config = getTemplateConfig(actionSlug);
  if (!config) throw new Error(`Unknown action: ${actionSlug}`);

  const data = { ...input };

  // Common for all actions: country-derived fields (Country_Standard_Time, etc.)
  const country = input.Country ?? input.country;
  const timezoneId = input.countryTimezoneId ?? input.CountryTimezoneId;
  if (country) {
    try {
      Object.assign(data, await resolveCountryData(country, timezoneId));
    } catch (err) {
      // If country resolution fails, continue without it
      console.warn(`Failed to resolve country data for ${country}:`, err.message);
    }
  }

  // Event_Date → Event_Day only (Date_of_FR is independent: form + country default)
  if (input.Event_Date) {
    if (!data.Event_Day) {
      data.Event_Day = deriveEventDay(input.Event_Date);
    }
    if (data.Event_Date === input.Event_Date && String(input.Event_Date).includes('-')) {
      data.Event_Date = formatEventDate(input.Event_Date);
    }
  }

  // Common distance computation for all actions (if Distance_In_Kilometres is present)
  if (input.Distance_In_Kilometres != null && input.Distance_In_Kilometres !== '') {
    if (!data.Distance_In_Miles) {
      try {
        data.Distance_In_Miles = convertKmToMiles(input.Distance_In_Kilometres);
      } catch (err) {
        // If conversion fails, skip it
        console.warn(`Failed to convert Distance_In_Kilometres to miles:`, err.message);
      }
    }
  }

  // Common time automation for all actions (Start_Time_For_Report_Preparation, etc.)
  const startTime = pickStartTimeForAutomation(input);
  if (startTime) {
    if (!data.Start_Time_For_Report_Preparation) {
      try {
        const timeResult = runTimeAutomation(startTime);
        Object.assign(data, timeResult);
      } catch (err) {
        console.warn(`Failed to run time automation:`, err.message);
      }
    }
  }

  switch (config.automation) {
    case 'arrangeVenue':
      return await runArrangeVenueAutomations(data, { previewOnly });
    default:
      await finalizeDateOfFRForMerge(data, country, timezoneId);
      return data;
  }
}

/** Format or default Date of FR for templates (any variable alias; never from Event_Date). */
async function finalizeDateOfFRForMerge(data, country, timezoneId) {
  const keys = collectDateOfFRKeys(data);
  if (keys.length === 0) return;

  let raw = '';
  for (const k of keys) {
    const v = data[k];
    if (v != null && String(v).trim()) {
      raw = String(v).trim();
      break;
    }
  }

  let formatted = '';
  if (raw) {
    formatted = formatDateOfFR(raw);
  } else if (country) {
    try {
      const ct = await getCurrentCountryTime(country, timezoneId);
      if (ct?.isoDate) formatted = formatDateOfFR(ct.isoDate);
    } catch (err) {
      console.warn('Date_of_FR country default:', err.message);
    }
  }
  if (!formatted) {
    formatted = formatDateOfFR(new Date().toISOString().slice(0, 10));
  }
  for (const k of keys) {
    data[k] = formatted;
  }
}
