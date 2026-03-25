/**
 * Recognize "Date of FR" template variables regardless of underscore/casing
 * (e.g. Date_of_FR, Date_Of_F_R, DATE_OF_FR, DateOfFR).
 */
export function isDateOfFRVariableName(name) {
  if (!name || typeof name !== 'string') return false;
  const letters = name.replace(/[^a-zA-Z]/g, '').toLowerCase();
  return letters === 'dateoffr';
}

export function collectDateOfFRKeys(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).filter(isDateOfFRVariableName);
}
