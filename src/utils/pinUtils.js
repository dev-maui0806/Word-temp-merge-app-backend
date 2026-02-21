const PIN_REGEX = /^\d{4}$/;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 15;

/**
 * Validates PIN format: 4 digits only.
 * @param {string} pin
 * @returns {boolean}
 */
export function isValidPinFormat(pin) {
  return typeof pin === 'string' && PIN_REGEX.test(pin);
}

/**
 * Validates and throws if invalid.
 */
export function validatePinFormat(pin) {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
}
