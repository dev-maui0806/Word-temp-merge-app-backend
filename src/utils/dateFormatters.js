import dayjs from 'dayjs';

/** DD Month YYYY - e.g. "18 February 2025" */
export function formatDateOfFR(date) {
  return dayjs(date).format('DD MMMM YYYY');
}

/** Month DD, YYYY - e.g. "February 18, 2025" */
export function formatEventDate(date) {
  return dayjs(date).format('MMMM DD, YYYY');
}

/** Day name - e.g. "Friday" */
export function deriveEventDay(date) {
  return dayjs(date).format('dddd');
}
