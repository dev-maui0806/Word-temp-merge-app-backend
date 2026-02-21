/**
 * Automation Runner: Runs the appropriate automation for each action type.
 * Delegates to action-specific services when available.
 */

import { runArrangeVenueAutomations } from './arrangeVenue.service.js';
import { resolveCountryData } from '../utils/resolveCountryData.js';
import { formatDateOfFR, formatEventDate, deriveEventDay } from '../utils/dateFormatters.js';
import { convertKmToMiles } from '../utils/convertKmToMiles.js';
import { runTimeAutomation } from '../utils/timeAutomation.js';
import { getTemplateConfig } from '../templates/templateRegistry.js';

/**
 * Run automation for an action. Returns data ready for template merge.
 * Common logic (country, dates, distance, time) runs for ALL action types
 * (arrange/cancel venue, transportation, accommodation, notary, ent-test, etc.).
 *
 * @param {string} actionSlug - e.g. 'arrange-venue', 'arrange-accommodation', 'cancel-notary'
 * @param {Object} input - Raw form data
 * @returns {Object} Processed data for DocxGenerator
 */
export function runAutomation(actionSlug, input) {
  const config = getTemplateConfig(actionSlug);
  if (!config) throw new Error(`Unknown action: ${actionSlug}`);

  const data = { ...input };

  // Common for all actions: country-derived fields (Country_Standard_Time, etc.)
  const country = input.Country ?? input.country;
  if (country) {
    try {
      Object.assign(data, resolveCountryData(country));
    } catch (err) {
      // If country resolution fails, continue without it
      console.warn(`Failed to resolve country data for ${country}:`, err.message);
    }
  }

  // Common date computations for all actions (if Event_Date is present)
  if (input.Event_Date) {
    // Only compute if not already set (arrangeVenue automation will set these)
    if (!data.Date_of_FR) {
      data.Date_of_FR = formatDateOfFR(input.Event_Date);
    }
    if (!data.Event_Day) {
      data.Event_Day = deriveEventDay(input.Event_Date);
    }
    // Format Event_Date if it's still in ISO format
    if (data.Event_Date === input.Event_Date && input.Event_Date.includes('-')) {
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
  // Use any Start_Time_* or Event_Time field as the seed so all action types are covered
  const startTime =
    input.Start_Time_For_Booking_Venue ??
    input.Start_Time_For_Cancel_Venue ??
    input.Start_Time_For_Cancel_Transportation ??
    input.Start_Time_For_Arrange_Transportation ??
    input.Start_Time_For_Booking_Transportation ??
    (() => {
      for (const [key, value] of Object.entries(input)) {
        if ((key.startsWith('Start_Time_') || key === 'Event_Time') && typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return null;
    })();
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
      return runArrangeVenueAutomations(data);
    default:
      return data;
  }
}
