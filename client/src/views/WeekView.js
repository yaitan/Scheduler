/**
 * WeekView.js
 *
 * 7-column time grid showing all sessions for a full week (Sunday–Saturday).
 *
 * Layout:
 *   - Top bar: back button, week label with prev/next navigation, + new session button.
 *   - Sticky time-label column on the left showing hour numbers.
 *   - One day column per day of the week, each with:
 *       - A clickable header (day name + date number + holiday label) that opens DayView.
 *       - A time body with clickable hour slots, holiday/Shabbat overlay blocks,
 *         a "now" line on today, and absolutely-positioned session blocks.
 *
 * The week grid uses HOUR_PX = 32 (shorter than DayView's 48) so the full day
 * fits in the viewport on typical screens. The grid scrolls to 8:30am on mount
 * and on every week change.
 *
 * Sessions are fetched by month. If the week spans two months (e.g. Jan 29 – Feb 4),
 * two parallel requests are made and their results are merged before filtering to
 * the week's date range.
 *
 * API routes used:
 *   GET  /api/sessions?month=YYYY-MM  — One request per unique month spanned by
 *                                       the displayed week (usually 1, sometimes 2).
 */

import React, { useState, useEffect, useRef } from 'react';
import DayView from './DayView';
import SessionModal from '../components/SessionModal';
import { MONTH_NAMES, DOW_LABELS, toDateStr, nowInIsrael, fmtDuration, timeToOffset } from '../utils/dateUtils';
import { getHolidayEventsByDate, getHebrewName, getAllDayHolidays, getTimedHolidays } from '../utils/israeliHolidays';
import { apiFetch } from '../utils/api';
import '../styles/week.css';

/** Pre-built holiday map (module-level so it's computed once per app load). */
const HOLIDAY_EVENTS = getHolidayEventsByDate();

/** Total hours in the grid — used to compute the bottom edge for open-ended holiday blocks. */
const TOTAL_GRID_HEIGHT = 24;

const GRID_START = 0;  // First visible hour.
const GRID_END   = 24; // Last visible hour, exclusive.
const HOUR_PX    = 32; // Pixel height per hour — shorter than DayView to fit the full day on screen.

/**
 * Generates an array of 7 Date objects starting from weekStart (Sunday).
 *
 * @param {Date} weekStart - The Sunday that begins the week.
 * @returns {Date[]} Array of 7 dates: [Sun, Mon, Tue, Wed, Thu, Fri, Sat].
 */
function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

/**
 * Builds a human-readable label for the week range.
 * If the week is within a single month: "March 2–8, 2025"
 * If it spans two months:              "March 30 – April 5, 2025"
 *
 * @param {Date[]} days - The 7-element array from getWeekDays().
 * @returns {string}
 */
function weekLabel(days) {
  const start = days[0];
  const end   = days[6];
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

/**
 * WeekView
 *
 * Props:
 *   weekStart        {Date}     — The Sunday that starts the displayed week.
 *   onBack           {Function} — Called when the user clicks the back button
 *                                 to return to CalendarView.
 *   onSessionCreated {Function} — Called after a session is saved or deleted so
 *                                 CalendarView can refresh its own data.
 *
 * States:
 *   weekStart    {Date}        — The currently displayed week's start date. Starts
 *                                from the `initialWeekStart` prop but updates as the
 *                                user navigates prev/next.
 *   sessions     {Array}       — All sessions for the displayed week, fetched from
 *                                GET /api/sessions?month=YYYY-MM (one or two requests).
 *   selectedDay  {Date|null}   — When non-null, DayView is rendered for this date.
 *   newSession   {object|null} — When non-null, SessionModal opens in new-session mode.
 *                                Carries { date, time? }.
 *   editSession  {object|null} — When non-null, SessionModal opens in edit mode with
 *                                this session object.
 *   refreshKey   {number}      — Incrementing counter that triggers a re-fetch when
 *                                changed. Incremented after any modal save or delete.
 */
function WeekView({ weekStart: initialWeekStart, onBack, onSessionCreated }) {
  const [weekStart, setWeekStart]     = useState(initialWeekStart);
  const [sessions, setSessions]       = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [newSession, setNewSession]   = useState(null);  // null | { date, time }
  const [editSession, setEditSession] = useState(null);  // null | session object
  const [refreshKey, setRefreshKey]   = useState(0);
  const scrollRef = useRef(null);

  const days         = getWeekDays(weekStart);
  const weekStartStr = toDateStr(weekStart); // Used as useEffect dependency.

  // Scroll to 8:30am whenever the week changes so the active part of the day
  // is immediately visible without manual scrolling.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8.5 * HOUR_PX;
    }
  }, [weekStartStr]);

  /**
   * GET /api/sessions?month=YYYY-MM  (one or two requests)
   *
   * Derives the unique set of months spanned by this week, fetches sessions
   * for each in parallel, then merges and filters to only dates within the week.
   *
   * Two-month fetches happen when the week crosses a month boundary
   * (e.g. a week from Jan 29 to Feb 4 requires both "2025-01" and "2025-02").
   */
  useEffect(() => {
    // Deduplicate months (usually 1, occasionally 2 for month-boundary weeks).
    const months = [...new Set(days.map(d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    ))];
    const weekDates = new Set(days.map(toDateStr));

    Promise.all(
      months.map(m => apiFetch(`/api/sessions?month=${m}`).then(r => r.json()).catch(() => []))
    ).then(results => {
      // Flatten all month results and keep only sessions within this week's dates.
      setSessions(results.flat().filter(s => weekDates.has(s.date)));
    });
  }, [weekStartStr, refreshKey]);

  /** Navigates to the previous week. */
  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  /** Navigates to the next week. */
  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  const hours    = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
  const now      = nowInIsrael();
  const todayStr = toDateStr(now);
  // Pixel offset for the "now" line, calculated once and shared across all day columns.
  const nowTop   = (now.getHours() - GRID_START + now.getMinutes() / 60) * HOUR_PX;
  const showNow  = nowTop >= 0 && nowTop <= (GRID_END - GRID_START) * HOUR_PX;

  // Group sessions by date string and sort each day's sessions by start time.
  const byDate = {};
  sessions.forEach(s => {
    (byDate[s.date] = byDate[s.date] || []).push(s);
  });
  Object.values(byDate).forEach(list => list.sort((a, b) => a.time.localeCompare(b.time)));

  return (
    <div className="week-view">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="week-topbar">
        <button className="week-back-btn" onClick={onBack}>← </button>
        <div className="week-nav">
          <button className="cal-nav-btn" onClick={prevWeek} aria-label="Previous week">‹</button>
          <span className="week-title">{weekLabel(days)}</span>
          <button className="cal-nav-btn" onClick={nextWeek} aria-label="Next week">›</button>
        </div>
        <button
          className="new-session-btn"
          style={{ justifySelf: 'end' }}
          onClick={() => setNewSession({})}
        >
          +
        </button>
      </div>

      {/* ── Scrollable week grid ───────────────────────────────────────────── */}
      <div className="week-scroll" ref={scrollRef}>
        <div className="week-inner">

          {/* Sticky time-label column — one label per hour, sticks to the left
              as the user scrolls horizontally through the day columns. */}
          <div className="week-time-col">
            <div className="week-time-corner" />
            {hours.map((h, i) => (
              <div key={h} className={`week-time-label${i === 0 ? ' week-time-label--first' : ''}`}>
                {String(h)}
              </div>
            ))}
          </div>

          {/* ── Day columns ─────────────────────────────────────────────── */}
          {days.map((date, di) => {
            const dateStr     = toDateStr(date);
            const isToday     = dateStr === todayStr;
            const daySessions = byDate[dateStr] || [];

            return (
              <div key={di} className={`week-day-col${isToday ? ' week-day-col--today' : ''}`}>

                {/* Day header — clicking opens DayView for this date */}
                <div className="week-day-header" onClick={() => setSelectedDay(date)}>
                  <span className="week-day-name">{DOW_LABELS[date.getDay()]}</span>
                  <span className={`week-day-num${isToday ? ' week-day-num--today' : ''}`}>
                    {date.getDate()}
                  </span>
                  {/* All-day holiday names shown in the header (timed events go on the grid) */}
                  {getAllDayHolidays(HOLIDAY_EVENTS[dateStr]).map((ev, i) => (
                    <span key={i} className="week-day-holiday">{getHebrewName(ev.name)}</span>
                  ))}
                </div>

                {/* Time body — contains hour slots, overlays, now line, and session blocks */}
                <div className="week-day-body">

                  {/* Clickable hour slots */}
                  {hours.map(h => (
                    <div
                      key={h}
                      className="week-slot"
                      onClick={() => setNewSession({
                        date: dateStr,
                        time: `${String(h).padStart(2, '0')}:00`,
                      })}
                    />
                  ))}

                  {/* Holiday / Shabbat overlay blocks */}
                  {getTimedHolidays(HOLIDAY_EVENTS[dateStr]).map((ev, i) => {
                      // null start_time = from top of grid; null end_time = to bottom of grid.
                      const top    = ev.start_time ? timeToOffset(ev.start_time, HOUR_PX) : 0;
                      const bottom = ev.end_time
                        ? timeToOffset(ev.end_time, HOUR_PX)
                        : TOTAL_GRID_HEIGHT * HOUR_PX;
                      return (
                        <div
                          key={i}
                          className="holiday-block"
                          style={{ top, height: Math.max(bottom - top, 4) }}
                          title={getHebrewName(ev.name)}
                        >
                          <span className="holiday-block-name">{getHebrewName(ev.name)}</span>
                        </div>
                      );
                    })}

                  {/* "Now" line — only on today's column and only if time is in grid range */}
                  {isToday && showNow && (
                    <div className="week-now-line" style={{ top: nowTop }} />
                  )}

                  {/* Session blocks — minimum height 20px to keep short sessions clickable */}
                  {daySessions.map(s => (
                    <div
                      key={s.id}
                      className={`week-session week-session--${s.status.toLowerCase()}`}
                      style={{
                        top:    timeToOffset(s.time, HOUR_PX),
                        height: Math.max((s.duration / 60) * HOUR_PX, 20),
                      }}
                      onClick={e => { e.stopPropagation(); setEditSession(s); }}
                    >
                      <span className="week-session-name">{s.name}</span>
                      {/* \u00A0 is a non-breaking space used as a small visual indent */}
                      <span className="week-session-meta">{'\u00A0'} {s.time} · {fmtDuration(s.duration)}</span>
                    </div>
                  ))}

                </div>
              </div>
            );
          })}

        </div>
      </div>

      {/* DayView opened by clicking a day column header */}
      {selectedDay && (
        <DayView
          date={selectedDay}
          onClose={() => setSelectedDay(null)}
          onNavigate={setSelectedDay}
          onSessionCreated={() => { setRefreshKey(k => k + 1); onSessionCreated?.(); }}
        />
      )}

      {/* Edit session modal */}
      {editSession && (
        <SessionModal
          session={editSession}
          onClose={() => setEditSession(null)}
          onSaved={() => { setRefreshKey(k => k + 1); onSessionCreated?.(); }}
          onDeleted={() => { setRefreshKey(k => k + 1); onSessionCreated?.(); }}
        />
      )}

      {/* New session modal — time pre-filled when opened from an hour slot */}
      {newSession !== null && (
        <SessionModal
          initialDate={newSession.date}
          initialTime={newSession.time}
          onClose={() => setNewSession(null)}
          onSaved={() => { setRefreshKey(k => k + 1); onSessionCreated?.(); }}
        />
      )}

    </div>
  );
}

export default WeekView;
