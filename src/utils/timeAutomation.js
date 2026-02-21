import dayjs from 'dayjs';

const BOOKING_DURATION_MINUTES = 15;
const REPORT_DURATION_MINUTES = 5;
const REF_DATE = '2000-01-01';
const HH_MM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Runs the time automation chain from Start_Time_For_Booking_Venue.
 * @param {string} startTime - Input in "HH:mm" format
 * @param {Object} [override] - Optional overrides for any output fields
 * @returns {Object} Time automation result
 */
export function runTimeAutomation(startTime, override = {}) {
  if (!HH_MM_REGEX.test(String(startTime).trim())) {
    throw new Error(`Invalid start time: "${startTime}". Expected format: HH:mm`);
  }

  const parsed = dayjs(`${REF_DATE} ${startTime}`);

  const startBooking = parsed;
  const endBooking = startBooking.add(BOOKING_DURATION_MINUTES, 'minute');
  const startReport = endBooking;
  const endReport = startReport.add(REPORT_DURATION_MINUTES, 'minute');

  const totalMinutes = BOOKING_DURATION_MINUTES + REPORT_DURATION_MINUTES;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const totalTimeFormatted = `${hours}h${minutes}m`;

  const result = {
    Start_Time_For_Booking_Venue: startBooking.format('HH:mm'),
    End_Time_For_Booking_Venue: endBooking.format('HH:mm'),
    Start_Time_For_Report_Preparation: startReport.format('HH:mm'),
    End_Time_For_Report_Preparation: endReport.format('HH:mm'),
    Total_Time: totalTimeFormatted,
    Service_Time: totalTimeFormatted,
  };

  return { ...result, ...override };
}
