import holidayData from './israeli_holidays_shabbat_2026_2027.json';

function isoToLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getHebrewName(name) {
  const idx = name.indexOf(' / ');
  return idx !== -1 ? name.slice(0, idx) : name;
}

let _cache = null;

/**
 * Returns a map of { [dateStr]: [event, ...] } where each event is:
 *   { name, start_time, end_time, isShabbat }
 *
 * Shabbat entries (Saturday) also generate a matching Friday entry with
 * start_time = candle-lighting and end_time = null (extends to end of day grid).
 */
export function getHolidayEventsByDate() {
  if (_cache) return _cache;
  _cache = {};

  for (const [dateStr, entry] of Object.entries(holidayData)) {
    if (dateStr.startsWith('_')) continue;

    const date = isoToLocal(dateStr);
    const isShabbat =
      date.getDay() === 6 &&
      (entry.name.includes('שבת') || entry.name.includes('Shabbat'));

    if (isShabbat) {
      // Derive the preceding Friday
      const fri = new Date(date);
      fri.setDate(date.getDate() - 1);
      const fridayStr = toDateStr(fri);

      // Friday: candle-lighting to end of day
      if (!_cache[fridayStr]) _cache[fridayStr] = [];
      _cache[fridayStr].push({
        name: entry.name,
        start_time: entry.start_time || null,
        end_time: null,
        isShabbat: true,
      });

      // Saturday: start of day to havdalah
      if (!_cache[dateStr]) _cache[dateStr] = [];
      _cache[dateStr].push({
        name: entry.name,
        start_time: null,
        end_time: entry.end_time || null,
        isShabbat: true,
      });
    } else {
      if (!_cache[dateStr]) _cache[dateStr] = [];
      _cache[dateStr].push({
        name: entry.name,
        start_time: entry.start_time || null,
        end_time: entry.end_time || null,
        isShabbat: false,
      });
    }
  }

  return _cache;
}
