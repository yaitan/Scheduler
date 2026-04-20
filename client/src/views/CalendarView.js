/**
 * CalendarView.js
 *
 * The top-level calendar view — a standard month grid with session pills,
 * a summary bar, and drill-down to WeekView and DayView.
 *
 * Layout:
 *   - Header: previous/next month navigation (month opens YearlySummaryModal).
 *   - Summary bar: total amount owed (links to PaymentsView), monthly revenue
 *     (opens YearlySummaryModal), and total scheduled session time.
 *   - Day-of-week header row.
 *   - Month grid: 6 rows × 7 columns. Each cell shows the date number,
 *     holiday labels (if any), and session pills. Cells outside the current
 *     month are dimmed and not clickable. Clicking a cell opens DayView.
 *     Clicking a week number on the left opens WeekView.
 *
 * Sub-view navigation (managed via `subView` state):
 *   - null  → month grid (default)
 *   - 'week' → WeekView replaces the calendar entirely
 *   - 'day'  → DayView rendered as a portal overlay on top of the calendar
 *
 * API routes used:
 *   GET  /api/sessions?month=YYYY-MM   — Sessions for the displayed month.
 *                                        Re-fetched on month change and on refreshKey change.
 *   GET  /api/payments/summary         — Per-client balance totals, used to compute
 *                                        the "Total Owed" figure in the summary bar.
 *   GET  /api/sessions?year=YYYY       — All sessions for the year, fetched on demand
 *                                        when the user opens the yearly summary.
 */

import React, { useState, useEffect } from 'react';
import WeekView from './WeekView';
import DayView from './DayView';
import SessionModal from '../components/SessionModal';
import YearlySummaryModal from '../components/YearlySummaryModal';
import { getHolidayEventsByDate, getHebrewName } from '../utils/israeliHolidays';
import { apiFetch } from '../utils/api';
import { MONTH_NAMES, DOW_LABELS, toDateStr, getISOWeekNumber, nowInIsrael, fmtDuration } from '../utils/dateUtils';
import '../styles/calendar.css';

/** Pre-built holiday map (module-level so it's computed once per app load). */
const HOLIDAY_EVENTS = getHolidayEventsByDate();

/**
 * Builds the 2D array of Date objects that fill the month grid, including
 * padding days from the previous and next months to complete the first and
 * last rows.
 *
 * The grid always starts on Sunday (getDay() === 0) and is padded at the end
 * until the total cell count is a multiple of 7, ensuring complete rows.
 *
 * @param {number} year  - The full 4-digit year.
 * @param {number} month - Month index, 0-based (0 = January).
 * @returns {Date[][]} Array of weeks, each an array of 7 Date objects.
 */
function buildCalendarWeeks(year, month) {
  const firstDay   = new Date(year, month, 1);
  const lastDay    = new Date(year, month + 1, 0);
  const startDow   = firstDay.getDay(); // Day of week for the 1st (0 = Sunday).
  const daysInMonth = lastDay.getDate();

  const cells = [];

  // Fill leading padding with days from the previous month.
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push(new Date(year, month - 1, prevMonthLastDay - i));
  }

  // Current month days.
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }

  // Fill trailing padding with days from the next month until the row is complete.
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push(new Date(year, month + 1, nextDay++));
  }

  // Chunk the flat array into rows of 7.
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/**
 * CalendarView
 *
 * Props:
 *   onNavigate  {Function} — Called with a view name string ('payments', etc.)
 *                            when the user clicks a link in the summary bar.
 *
 * States:
 *   year              {number}      — The currently displayed year.
 *   month             {number}      — The currently displayed month (0-based).
 *   sessions          {Array}       — Sessions for the displayed month from
 *                                     GET /api/sessions?month=YYYY-MM.
 *   totalOwed         {number}      — Sum of all positive client balances from
 *                                     GET /api/payments/summary, displayed in
 *                                     the summary bar.
 *   loading           {boolean}     — True while the parallel month fetch is running.
 *                                     The calendar grid is hidden during loading.
 *   subView           {string|null} — Controls which sub-view is active:
 *                                     null='month grid', 'week'=WeekView, 'day'=DayView.
 *   selectedWeekStart {Date|null}   — The Sunday passed to WeekView when subView='week'.
 *   selectedDay       {Date|null}   — The date passed to DayView when subView='day'.
 *   newSessionOpen    {boolean}     — When true, SessionModal opens with no pre-fill.
 *   yearlySummaryOpen {boolean}     — When true, YearlySummaryModal is shown.
 *   yearlyData        {Array|null}  — 12-element array of { revenue, minutes } built
 *                                     from GET /api/sessions?year=YYYY. Null until fetched.
 *   refreshKey        {number}      — Incrementing counter that triggers a re-fetch.
 *                                     Incremented after any session save or delete.
 */
function CalendarView({ onNavigate }) {
  const today    = nowInIsrael();
  const todayStr = toDateStr(today);

  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [sessions, setSessions]     = useState([]);
  const [totalOwed, setTotalOwed]   = useState(0);
  const [loading, setLoading]       = useState(false);
  const [subView, setSubView]       = useState(null); // null | 'week' | 'day'
  const [selectedWeekStart, setSelectedWeekStart] = useState(null);
  const [selectedDay, setSelectedDay]             = useState(null);
  const [newSessionOpen, setNewSessionOpen]       = useState(false);
  const [yearlySummaryOpen, setYearlySummaryOpen] = useState(false);
  const [yearlyData, setYearlyData]               = useState(null);
  const [refreshKey, setRefreshKey]               = useState(0);

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  /**
   * GET /api/sessions?month=YYYY-MM
   * GET /api/payments/summary
   *
   * Fetches sessions and payment summary in parallel whenever the displayed
   * month changes or refreshKey increments. totalOwed sums only positive
   * balances (clients who owe money) — credits are excluded from the display.
   */
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch(`/api/sessions?month=${monthStr}`).then(r => r.json()).catch(() => []),
      apiFetch('/api/payments/summary').then(r => r.json()).catch(() => []),
    ]).then(([sessionData, summaryData]) => {
      setSessions(Array.isArray(sessionData) ? sessionData : []);

      // Sum only positive balances — negative values are credits, not owed amounts.
      const owed = (Array.isArray(summaryData) ? summaryData : [])
        .reduce((sum, c) => sum + Math.max(0, c.balance_owed), 0);
      setTotalOwed(owed);

      setLoading(false);
    });
  }, [monthStr, refreshKey]);

  const weeks = buildCalendarWeeks(year, month);

  // Group sessions by date and sort each day's list by start time for consistent rendering.
  const sessionsByDate = {};
  sessions.forEach(s => {
    if (!sessionsByDate[s.date]) sessionsByDate[s.date] = [];
    sessionsByDate[s.date].push(s);
  });
  Object.values(sessionsByDate).forEach(list =>
    list.sort((a, b) => a.time.localeCompare(b.time))
  );

  // Summary bar values computed from the current month's session data.
  const completed    = sessions.filter(s => s.status === 'Completed');
  const scheduled    = sessions.filter(s => s.status === 'Scheduled');
  const totalRevenue = completed.reduce((sum, s) => sum + (s.duration / 60) * s.rate, 0);
  const totalMinutes = scheduled.reduce((sum, s) => sum + s.duration, 0);

  /** Wraps month decrement, rolling back to December of the previous year in January. */
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  /** Wraps month increment, rolling forward to January of the next year in December. */
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  /**
   * GET /api/sessions?year=YYYY
   *
   * Fetches all sessions for the current year and aggregates them into a
   * 12-element array of { revenue, minutes } for YearlySummaryModal.
   * Only completed sessions contribute to revenue and minutes.
   */
  function openYearlySummary() {
    apiFetch(`/api/sessions?year=${year}`).then(r => r.json()).catch(() => []).then(yearlySessions => {
      const data = Array.from({ length: 12 }, (_, i) => {
        // Filter to completed sessions whose date starts with this month's prefix.
        const monthPrefix = `${year}-${String(i + 1).padStart(2, '0')}-`;
        const done = (Array.isArray(yearlySessions) ? yearlySessions : [])
          .filter(s => s.status === 'Completed' && s.date.startsWith(monthPrefix));
        return {
          revenue: done.reduce((sum, s) => sum + (s.duration / 60) * s.rate, 0),
          minutes: done.reduce((sum, s) => sum + s.duration, 0),
        };
      });
      setYearlyData(data);
      setYearlySummaryOpen(true);
    });
  }

  /**
   * Opens WeekView for the week that contains the clicked week-number cell.
   *
   * @param {Date} weekStart - The Sunday of the clicked week row.
   */
  function handleWeekClick(weekStart) {
    setSelectedWeekStart(weekStart);
    setSubView('week');
  }

  /**
   * Opens DayView for the clicked calendar cell.
   * stopPropagation prevents the click from bubbling to the week row.
   *
   * @param {React.MouseEvent} e
   * @param {Date} date - The clicked day's Date object.
   */
  function handleDayClick(e, date) {
    e.stopPropagation();
    setSelectedDay(date);
    setSubView('day');
  }

  // ─── WeekView sub-view ───────────────────────────────────────────────────────
  // WeekView replaces the calendar entirely (not a modal overlay).
  if (subView === 'week') {
    return (
      <WeekView
        weekStart={selectedWeekStart}
        onBack={() => setSubView(null)}
        onDayClick={(date) => { setSelectedDay(date); setSubView('day'); }}
        onSessionCreated={() => setRefreshKey(k => k + 1)}
      />
    );
  }

  // ─── Month grid view ─────────────────────────────────────────────────────────
  return (
    <div className="calendar">

      {/* Month navigation header */}
      <div className="calendar-header">
        <div />
        <div className="calendar-header-nav">
          <button className="cal-nav-btn" onClick={prevMonth} aria-label="Previous month">‹</button>
          <h2 className="calendar-month-title" onClick={openYearlySummary}>{MONTH_NAMES[month]} {year}</h2>
          <button className="cal-nav-btn" onClick={nextMonth} aria-label="Next month">›</button>
        </div>
        <div className="calendar-header-actions">
          <button className="new-session-btn" onClick={() => setNewSessionOpen(true)}>
            +
          </button>
        </div>
      </div>

      {/* Summary bar — "Total Owed" navigates to PaymentsView; "Revenue" opens
          YearlySummaryModal; "Scheduled" is display-only. */}
      <div className="calendar-summary">
        <button className="summary-stat summary-stat--btn" onClick={() => onNavigate('payments')}>
          <span className="summary-label">Total Owed</span>
          <span className="summary-value summary-value--owed">₪{Math.round(totalOwed).toLocaleString()}</span>
        </button>
        <div className="summary-divider" />
        <button className="summary-stat summary-stat--btn" onClick={openYearlySummary}>
          <span className="summary-label">Revenue</span>
          <span className="summary-value summary-value--revenue">₪{Math.round(totalRevenue).toLocaleString()}</span>
        </button>
        <div className="summary-divider" />
        <div className="summary-stat">
          <span className="summary-label">Scheduled</span>
          <span className="summary-value">{fmtDuration(totalMinutes)}</span>
        </div>
      </div>

      {/* Day-of-week header row (Sun–Sat) */}
      <div className="calendar-dow-row">
        <div className="calendar-dow-label calendar-week-num-header" />
        {DOW_LABELS.map(d => (
          <div key={d} className="calendar-dow-label">{d}</div>
        ))}
      </div>

      {/* Month grid — hidden while loading to avoid a flash of empty cells */}
      {!loading && (
        <div className="calendar-body">
          {weeks.map((week, wi) => (
            <div key={wi} className="calendar-week">
              {/* ISO week number — clicking opens WeekView for that week */}
              <div
                className="calendar-week-num"
                onClick={() => handleWeekClick(week[0])}
                title="Open week view"
              >
                {getISOWeekNumber(week[0])}
              </div>

              {week.map((date, di) => {
                const dateStr        = toDateStr(date);
                const isCurrentMonth = date.getMonth() === month;
                const isToday        = dateStr === todayStr;

                // Padding cells (outside the current month) show no sessions or holidays.
                const daySessions = isCurrentMonth ? (sessionsByDate[dateStr] || []) : [];
                const dayHolidays = isCurrentMonth ? (HOLIDAY_EVENTS[dateStr] || []) : [];

                return (
                  <div
                    key={di}
                    className={[
                      'calendar-cell',
                      !isCurrentMonth && 'calendar-cell--other-month',
                      isToday && 'calendar-cell--today',
                    ].filter(Boolean).join(' ')}
                    // Padding cells are not clickable.
                    onClick={e => isCurrentMonth && handleDayClick(e, date)}
                  >
                    <div className="cell-date-num">{date.getDate()}</div>

                    {dayHolidays.length > 0 && (
                      <div className="cell-holidays">
                        {dayHolidays.map((ev, i) => (
                          <div key={i} className="cell-holiday">{getHebrewName(ev.name)}</div>
                        ))}
                      </div>
                    )}

                    <div className="cell-sessions">
                      {daySessions.map(s => (
                        <div
                          key={s.id}
                          className={`session-pill session-pill--${s.status.toLowerCase()}`}
                          onClick={e => handleDayClick(e, date)}
                        >
                          <span className="pill-client">{s.name}</span>
                          <span className="pill-time">{s.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* DayView — rendered as a portal overlay on top of the month grid */}
      {subView === 'day' && selectedDay && (
        <DayView
          date={selectedDay}
          onClose={() => setSubView(null)}
          onNavigate={date => setSelectedDay(date)}
          onSessionCreated={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* New session modal — no pre-fill when opened from the header + button */}
      {newSessionOpen && (
        <SessionModal
          onClose={() => setNewSessionOpen(false)}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* Yearly summary modal — yearlyData cleared on close to free memory */}
      {yearlySummaryOpen && yearlyData && (
        <YearlySummaryModal
          year={year}
          monthlyData={yearlyData}
          onClose={() => { setYearlySummaryOpen(false); setYearlyData(null); }}
          onMonthClick={mi => { setMonth(mi); setYearlySummaryOpen(false); setYearlyData(null); }}
        />
      )}
    </div>
  );
}

export default CalendarView;
