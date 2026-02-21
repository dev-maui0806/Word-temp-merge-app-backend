const KM_TO_MILES = 0.621371;

/**
 * Converts kilometres to miles (internal conversion factor, not user-configurable).
 * @param {number} km - Distance in kilometres
 * @returns {string} Miles as string with 2 decimal places
 */
export function convertKmToMiles(km) {
  const num = Number(km);
  if (Number.isNaN(num) || num < 0) {
    throw new Error('Invalid input: km must be a non-negative number');
  }
  const miles = Math.round(num * KM_TO_MILES * 100) / 100;
  return miles.toFixed(2);
}
