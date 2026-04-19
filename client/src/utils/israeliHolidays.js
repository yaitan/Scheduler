/**
 * israeliHolidays.js
 *
 * Processes a static JSON dataset of Israeli holidays and Shabbat times into
 * a date-keyed map used by the calendar views to render holiday/Shabbat overlays.
 *
 * The source data (israeli_holidays_shabbat_2026_2027.json) contains one entry
 * per Shabbat/holiday with start_time (candle-lighting or holiday start) and
 * end_time (havdalah or holiday end).
 *
 * Shabbat entries are split across two days:
 *   - Friday: candle-lighting time to end of day (start_time set, end_time null).
 *   - Saturday: start of day to havdalah time (start_time null, end_time set).
 * This allows the calendar to shade each day with the correct time range.
 *
 * The result is memoized in a module-level cache after the first call, since
 * the source data never changes at runtime.
 *
 * Exports:
 *   getHebrewName(name)         — Extract the Hebrew portion from a "Hebrew / English" name string.
 *   getHolidayEventsByDate()    — Return the full { [dateStr]: [event, ...] } map, building
 *                                 and caching it on first call.
 *   getAllDayHolidays(events)   — Filter an event array to only all-day entries (no start/end time).
 *   getTimedHolidays(events)    — Filter an event array to only timed entries (has start or end time).
 */

import holidayData from './israeli_holidays_shabbat_2026_2027.json';
import { toDateStr } from './dateUtils';

/**
 * Parses a YYYY-MM-DD string as a local Date (not UTC), preventing timezone
 * offset from shifting the date by one day.
 *
 * @param {string} dateStr - Date string in YYYY-MM-DD format.
 * @returns {Date}
 */
function isoToLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Extracts the Hebrew portion from a bilingual "Hebrew / English" holiday name.
 * If the name contains no " / " separator, the full name is returned unchanged.
 *
 * @param {string} name - Holiday name, potentially in "Hebrew / English" format.
 * @returns {string} The Hebrew name, or the full name if no separator is found.
 */
export function getHebrewName(name) {
  const idx = name.indexOf(' / ');
  return idx !== -1 ? name.slice(0, idx) : name;
}

// Module-level cache. Populated on the first call to getHolidayEventsByDate()
// and reused for all subsequent calls, since the data is static.
let _cache = null;

/**
 * Builds and returns a map of holiday/Shabbat events keyed by date string.
 *
 * Return shape:
 *   {
 *     "YYYY-MM-DD": [
 *       { name: string, start_time: string|null, end_time: string|null, isShabbat: boolean },
 *       ...
 *     ],
 *     ...
 *   }
 *
 * Shabbat handling (see file header for rationale):
 *   - The Saturday entry in the JSON becomes two calendar entries:
 *       Friday  → { start_time: candle-lighting, end_time: null,         isShabbat: true }
 *       Saturday → { start_time: null,            end_time: havdalah,     isShabbat: true }
 *   - Non-Shabbat holidays are inserted as-is for their own date.
 *
 * Keys starting with "_" in the JSON are metadata (e.g. "_source") and are skipped.
 *
 * @returns {Object} Date-keyed map of event arrays. Result is cached after first call.
 */
export function getHolidayEventsByDate() {
  if (_cache) return _cache;
  _cache = {};

  for (const [dateStr, entry] of Object.entries(holidayData)) {
    // Skip metadata keys (prefixed with "_").
    if (dateStr.startsWith('_')) continue;

    const date = isoToLocal(dateStr);

    // Detect Shabbat: the entry falls on a Saturday and its name contains
    // "שבת" (Hebrew) or "Shabbat" (transliteration).
    const isShabbat =
      date.getDay() === 6 &&
      (entry.name.includes('שבת') || entry.name.includes('Shabbat'));

    if (isShabbat) {
      // ── Friday entry: candle-lighting to end of day ──────────────────────
      const fri = new Date(date);
      fri.setDate(date.getDate() - 1);
      const fridayStr = toDateStr(fri);

      if (!_cache[fridayStr]) _cache[fridayStr] = [];
      _cache[fridayStr].push({
        name:       entry.name,
        start_time: entry.start_time || null,
        end_time:   null,             // Shabbat extends to end of the day grid on Friday.
        isShabbat:  true,
      });

      // ── Saturday entry: start of day to havdalah ─────────────────────────
      if (!_cache[dateStr]) _cache[dateStr] = [];
      _cache[dateStr].push({
        name:       entry.name,
        start_time: null,             // Shabbat begins at the start of the day grid on Saturday.
        end_time:   entry.end_time || null,
        isShabbat:  true,
      });
    } else {
      // Non-Shabbat holiday: single entry on its own date.
      if (!_cache[dateStr]) _cache[dateStr] = [];
      _cache[dateStr].push({
        name:       entry.name,
        start_time: entry.start_time || null,
        end_time:   entry.end_time   || null,
        isShabbat:  false,
      });
    }
  }

  return _cache;
}

/**
 * Returns only all-day events from an event array — those with neither a
 * start_time nor an end_time. These are displayed as labels in day/week
 * headers rather than as blocks on the time grid.
 *
 * @param {Array} events - Event array for a single date (from getHolidayEventsByDate()).
 * @returns {Array}
 */
export function getAllDayHolidays(events) {
  return (events || []).filter(ev => !ev.start_time && !ev.end_time);
}

/**
 * Returns only timed events from an event array — those with at least one of
 * start_time or end_time set. These are rendered as overlay blocks on the time
 * grid (e.g. Shabbat candle-lighting to havdalah).
 *
 * @param {Array} events - Event array for a single date (from getHolidayEventsByDate()).
 * @returns {Array}
 */
export function getTimedHolidays(events) {
  return (events || []).filter(ev => ev.start_time || ev.end_time);
}
