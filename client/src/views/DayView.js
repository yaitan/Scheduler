/**
 * DayView.js
 *
 * Full-screen time-grid modal for a single day, showing all sessions as
 * positioned blocks and Israeli holiday/Shabbat overlays.
 *
 * Rendered via React Portal (document.body) so it overlays the CalendarView
 * or WeekView without being clipped by any parent's overflow/z-index.
 *
 * Layout:
 *   - Header: previous/next day navigation, day label, holiday names (all-day
 *     events only), projected income for the day, + button, and close button.
 *   - Scrollable time grid: 24 hours tall, each hour clickable to pre-fill a
 *     new session at that time. Session blocks are absolutely positioned using
 *     timeToOffset(). A "now" line shows the current time on today's date.
 *   - Holiday/Shabbat blocks are rendered as translucent overlays covering their
 *     time range (candle-lighting → end-of-day on Friday; start-of-day →
 *     havdalah on Saturday; start → end for other holidays).
 *
 * The view scrolls to 8:30am on open and whenever the date changes.
 *
 * API routes used:
 *   GET  /api/sessions?month=YYYY-MM  — Fetches all sessions for the month
 *                                       containing the displayed date, then filters
 *                                       client-side to just the selected day.
 *                                       (Month-level fetch is reused by WeekView
 *                                       to avoid per-day requests.)
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import SessionModal from '../components/SessionModal';
import { MONTH_NAMES, DOW_FULL, toDateStr, nowInIsrael, fmtDuration, timeToOffset } from '../utils/dateUtils';
import { getHolidayEventsByDate, getHebrewName, getAllDayHolidays, getTimedHolidays } from '../utils/israeliHolidays';
import { apiFetch } from '../utils/api';
import '../styles/day.css';

/** Pre-built holiday map (module-level so it's computed once per app load). */
const HOLIDAY_EVENTS = getHolidayEventsByDate();

/** Total hours in the grid — used to compute the bottom edge for open-ended holiday blocks. */
const TOTAL_GRID_HEIGHT = 24;

const GRID_START = 0;  // First visible hour (0 = midnight).
const GRID_END   = 24; // Last visible hour, exclusive (renders hours 0–23).
const HOUR_PX    = 48; // Pixel height of one hour row. Also used by timeToOffset().

/**
 * DayView
 *
 * Props:
 *   date             {Date}     — The calendar date to display.
 *   onClose          {Function} — Called when the user closes the overlay.
 *   onNavigate       {Function} — Called with a new Date when the user clicks
 *                                 the prev/next day arrows, allowing the parent
 *                                 to update the displayed date.
 *   onSessionCreated {Function} — Called after a session is saved or deleted so
 *                                 the parent (CalendarView/WeekView) can refresh
 *                                 its own session data.
 *
 * States:
 *   sessions    {Array}       — Sessions for the displayed date, filtered from the
 *                               month fetch (GET /api/sessions?month=YYYY-MM).
 *   newSession  {object|null} — When non-null, SessionModal opens in new-session mode.
 *                               Carries { date, time? } — time is pre-filled when the
 *                               user clicks a specific hour slot.
 *   editSession {object|null} — When non-null, SessionModal opens in edit mode with
 *                               this session object.
 *   refreshKey  {number}      — Incrementing counter that triggers a re-fetch when
 *                               changed. Incremented after any modal save or delete.
 */
function DayView({ date, onClose, onNavigate, onSessionCreated }) {
  const [sessions, setSessions]       = useState([]);
  const [newSession, setNewSession]   = useState(null);  // null | { date, time }
  const [editSession, setEditSession] = useState(null);  // null | session object
  const [refreshKey, setRefreshKey]   = useState(0);
  const bodyRef = useRef(null);

  const dateStr  = toDateStr(date);
  // Month string used as the API query parameter and as a useEffect dependency.
  const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  /**
   * GET /api/sessions?month=YYYY-MM
   *
   * Fetches all sessions for the month, then filters to only this date.
   * Month-level fetching avoids a per-day request and keeps the same
   * cache key as WeekView (which also queries by month).
   */
  useEffect(() => {
    apiFetch(`/api/sessions?month=${monthStr}`)
      .then(r => r.json())
      .then(data => {
        setSessions((Array.isArray(data) ? data : []).filter(s => s.date === dateStr));
      })
      .catch(() => setSessions([]));
  }, [dateStr, monthStr, refreshKey]);

  // Scroll to 8:30am whenever the displayed date changes so the most active
  // part of the day is visible without manual scrolling.
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 8.5 * HOUR_PX;
    }
  }, [date]);

  /** Navigates to the previous calendar day. */
  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onNavigate(d);
  }

  /** Navigates to the next calendar day. */
  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    onNavigate(d);
  }

  const label = `${DOW_FULL[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  const hours  = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

  // Projected income = sum of (duration in hours × rate) for all sessions today.
  const projectedIncome = sessions.reduce((sum, s) => sum + s.duration * s.rate / 60, 0);

  // "Now" line — only shown when viewing today, and only if the current time
  // falls within the visible grid range.
  const now        = nowInIsrael();
  const isToday    = toDateStr(now) === dateStr;
  const nowOffset  = (now.getHours() - GRID_START + now.getMinutes() / 60) * HOUR_PX;
  const showNowLine = isToday && nowOffset >= 0 && nowOffset <= (GRID_END - GRID_START) * HOUR_PX;

  return createPortal(
    <div className="day-view-overlay" onClick={onClose}>
      {/* stopPropagation prevents the overlay click-to-close from firing inside the modal */}
      <div className="day-view-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="day-view-header">
          <button className="cal-nav-btn" onClick={prevDay} aria-label="Previous day">‹</button>
          <div className="day-view-title-wrap">
            <h3 className="day-view-title">{label}</h3>
            {/* All-day holiday names (events with no start or end time) shown inline
                in the header rather than as a block on the grid. */}
            {getAllDayHolidays(HOLIDAY_EVENTS[dateStr]).map((ev, i) => (
              <span key={i} className="day-view-holiday">{getHebrewName(ev.name)}</span>
            ))}
            {sessions.length > 0 && (
              <span className="day-view-income">₪{Math.round(projectedIncome).toLocaleString()}</span>
            )}
          </div>
          <button className="cal-nav-btn" onClick={nextDay} aria-label="Next day">›</button>
          <button
            className="new-session-btn day-new-session-btn"
            onClick={() => setNewSession({ date: dateStr })}
            aria-label="New session"
          >
            +
          </button>
          <button className="day-view-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Scrollable time grid ───────────────────────────────────────── */}
        <div className="day-view-body" ref={bodyRef}>
          <div className="day-grid">

            {/* Hour label column (left side) */}
            <div className="day-labels">
              {hours.map(h => (
                <div key={h} className="day-label">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Main slot column — contains all absolutely-positioned overlays */}
            <div className="day-slots">

              {/* Clickable hour slots — each slot is HOUR_PX tall and creates a
                  new session pre-filled with the clicked hour when clicked. */}
              {hours.map(hour => (
                <div
                  key={hour}
                  className="day-slot"
                  onClick={() => setNewSession({
                    date: dateStr,
                    time: `${String(hour).padStart(2, '0')}:00`,
                  })}
                />
              ))}

              {/* Holiday / Shabbat blocks — only timed events (with start or end time).
                  All-day events are shown in the header instead. */}
              {getTimedHolidays(HOLIDAY_EVENTS[dateStr]).map((ev, i) => {
                  // start_time null means "from the top of the grid" (e.g. Shabbat Saturday).
                  // end_time null means "to the bottom of the grid" (e.g. Shabbat Friday).
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

              {/* Current time indicator line */}
              {showNowLine && (
                <div className="day-now-line" style={{ top: nowOffset }} />
              )}

              {/* Session blocks — absolutely positioned by start time, height proportional
                  to duration. Minimum height of 24px prevents tiny blocks from being
                  unclickable. Status drives the CSS colour class. */}
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`day-session day-session--${s.status.toLowerCase()}`}
                  style={{
                    top:    timeToOffset(s.time, HOUR_PX),
                    height: Math.max((s.duration / 60) * HOUR_PX, 24),
                  }}
                  onClick={e => { e.stopPropagation(); setEditSession(s); }}
                >
                  <span className="day-session-client">{s.name}</span>
                  <span className="day-session-meta">{s.time} · {fmtDuration(s.duration)}</span>
                </div>
              ))}

            </div>
          </div>
        </div>

      </div>

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
    </div>,
    document.body
  );
}

export default DayView;
