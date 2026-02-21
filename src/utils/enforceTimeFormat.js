/**
 * Enforces global time format: removes colons/spaces and returns HHMM.
 * Use for all template variables containing "Time".
 * @param {string} timeString - Input e.g. "08:30" or "08 : 30"
 * @returns {string} HHMM format e.g. "0830"
 * @throws {Error} If invalid format
 */
export function enforceTimeFormat(timeString) {
  if (!timeString || typeof timeString !== 'string') {
    throw new Error('Time string must be a non-empty string');
  }

  const stripped = String(timeString).replace(/[\s:]/g, '');

  if (!/^\d{3,4}$/.test(stripped)) {
    throw new Error(`Invalid time format: "${timeString}". Expected HH:mm or HHMM`);
  }

  const padded = stripped.padStart(4, '0');
  const hours = parseInt(padded.slice(0, 2), 10);
  const minutes = parseInt(padded.slice(2, 4), 10);

  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid time: "${timeString}". Hours 00-23, minutes 00-59`);
  }

  return padded;
}
