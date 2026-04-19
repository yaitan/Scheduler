/**
 * dateUtils.js
 *
 * Shared date/time utility functions, constants, and formatters used across
 * views and components.
 *
 * All functions that deal with "current time" use the Israel timezone
 * (Asia/Jerusalem) rather than the browser's local timezone, because the app
 * is intended for use by an Israeli tutor and session scheduling logic (e.g.
 * "is this date in the past?") should reflect Israeli wall-clock time.
 *
 * Exports:
 *   MONTH_NAMES                — Full English month names, indexed 0–11.
 *   MONTH_NAMES_SHORT          — Abbreviated English month names, indexed 0–11.
 *   DOW_LABELS                 — Abbreviated day-of-week labels, indexed 0–6 (Sun–Sat).
 *   DOW_FULL                   — Full day-of-week names, indexed 0–6.
 *   nowInIsrael()              — Current wall-clock time as a Date whose local
 *                                getters reflect Israel time (Asia/Jerusalem).
 *   toDateStr(date)            — Format a Date as a YYYY-MM-DD string.
 *   formatDate(ymd)            — Format a YYYY-MM-DD string as "D Mon YYYY" (e.g. "5 Mar 2025").
 *   twoMonthsAgoStart()        — YYYY-MM-DD string for the first day of two months ago.
 *   timeToOffset(timeStr, px)  — Convert "HH:MM" to a pixel offset in a time grid.
 *   fmtDuration(minutes)       — Format total minutes as "XhYm" / "Xh" / "Ym".
 *   getISOWeekNumber(date)     — ISO 8601 week number (1–53) for a given date.
 */

/**
 * Full English month names, indexed 0 (January) through 11 (December).
 * Used by YearlySummaryModal and anywhere a human-readable month name is needed.
 */
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Abbreviated English month names, indexed 0 (Jan) through 11 (Dec).
 * Used by formatDate() and anywhere a short month label is needed.
 */
export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Abbreviated day-of-week labels, indexed 0 (Sunday) through 6 (Saturday).
 * Used by WeekView column headers.
 */
export const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Full day-of-week names, indexed 0 (Sunday) through 6 (Saturday).
 * Used by DayView headers and anywhere the full day name is needed.
 */
export const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Returns a Date object whose getFullYear/getMonth/getDate/getHours/getMinutes
 * all reflect the current wall-clock time in Israel (Asia/Jerusalem), regardless
 * of the browser's local timezone.
 *
 * How it works: Intl.DateTimeFormat.formatToParts() gives us each component of
 * the Israel time as a string. We parse those parts and construct a plain local
 * Date, which means the numeric getters will return Israeli values even when the
 * browser is in a different timezone.
 *
 * @returns {Date} A Date object whose local-time getters read as Israel time.
 */
export function nowInIsrael() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  // Build a lookup from part type (e.g. 'year', 'month') to its integer value.
  const get = type => parseInt(parts.find(p => p.type === type).value, 10);

  // Month is 0-indexed in the Date constructor, but formatToParts returns 1-indexed.
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/**
 * Formats a Date object as a YYYY-MM-DD string using local (not UTC) date components.
 * This is the canonical date string format used by the API and throughout the app.
 *
 * @param {Date} date
 * @returns {string} e.g. "2025-03-15"
 */
export function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Formats a YYYY-MM-DD date string as a readable "D Mon YYYY" label
 * (e.g. "5 Mar 2025") for display in tables and lists.
 *
 * @param {string} ymd - Date string in YYYY-MM-DD format.
 * @returns {string}
 */
export function formatDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${Number(d)} ${MONTH_NAMES_SHORT[Number(m) - 1]} ${y}`;
}

/**
 * Returns the YYYY-MM-DD string for the first day of two months ago.
 * Used as a `from` parameter for date-ranged API queries to limit results
 * to a recent, relevant window rather than the entire history.
 *
 * Handles the January edge case: if the current month is 0 (January), the
 * regex replacement rolls back to December of the previous year.
 *
 * @returns {string} e.g. "2025-01-01" when today is in March 2025.
 */
export function twoMonthsAgoStart() {
  const now = new Date();
  // Subtract 2 from the 1-indexed month to get two months ago (may yield "00").
  return `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}-01`
    .replace(/^(\d{4})-00-/, (_, y) => `${Number(y) - 1}-12-`); // Fix January → previous December.
}

/**
 * Converts a "HH:MM" time string to a pixel offset from the top of a time grid.
 * Used by CalendarView and DayView to position session blocks vertically.
 *
 * @param {string} timeStr - Time in "HH:MM" format (e.g. "14:30").
 * @param {number} hourPx  - The pixel height of one hour on the grid.
 * @returns {number} Pixel offset from the top of the grid.
 */
export function timeToOffset(timeStr, hourPx) {
  const [h, m] = timeStr.split(':').map(Number);
  return (h + m / 60) * hourPx;
}

/**
 * Formats a duration in minutes as a compact human-readable string.
 * Omits the hours or minutes component when it is zero to keep labels short.
 *
 * Examples:
 *   90  → "1h30m"
 *   60  → "1h"
 *   45  → "45m"
 *
 * @param {number} minutes - Total duration in minutes.
 * @returns {string} Formatted duration string.
 */
export function fmtDuration(minutes) {
  const h   = Math.floor(minutes / 60);
  const min = minutes % 60;
  if (min === 0) return `${h}h`;
  if (h === 0)   return `${min}m`;
  return `${h}h${min}m`;
}

/**
 * Computes the ISO 8601 week number for a given date.
 * ISO weeks start on Monday. Week 1 is defined as the week containing the
 * first Thursday of the year (equivalently, the week containing January 4th).
 *
 * Uses UTC arithmetic internally to avoid daylight saving time edge cases.
 *
 * @param {Date} date - Any JavaScript Date object.
 * @returns {number} ISO week number, 1–53.
 */
export function getISOWeekNumber(date) {
  // Work in UTC to avoid DST shifts affecting the day-of-week calculation.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

  // Shift to the nearest Thursday — ISO weeks are anchored to Thursday.
  // (d.getUTCDay() || 7) converts Sunday=0 to Sunday=7 for correct ISO arithmetic.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

  // Number of full weeks elapsed since Jan 1 of Thursday's year.
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
