const CANONICAL = {
  virtual: 'Virtual',
  'in person': 'In Person',
  none: '',
};

/**
 * Resolves meeting type for template output. Prevents placeholder leakage and blank residue.
 * @param {string} type - "Virtual" | "In Person" | "None"
 * @returns {string} "Virtual" | "In Person" | ""
 * @throws {Error} If type is not supported
 */
export function resolveMeetingType(type) {
  if (type === null || type === undefined) {
    throw new Error('Meeting type is required');
  }

  const normalized = String(type).trim();
  const key = normalized.toLowerCase();

  if (!(key in CANONICAL)) {
    const allowed = Object.keys(CANONICAL).join(', ');
    throw new Error(`Invalid meeting type: "${type}". Allowed: ${allowed}`);
  }

  return CANONICAL[key];
}
