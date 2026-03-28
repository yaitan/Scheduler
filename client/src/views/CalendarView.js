import React, { useState, useEffect } from 'react';
import WeekView from './WeekView';
import DayView from './DayView';
import NewSessionModal from '../components/NewSessionModal';
import JEWISH_HOLIDAYS from '../utils/jewishHolidays';
import { MONTH_NAMES, DOW_LABELS, toDateStr, getISOWeekNumber } from '../utils/dateUtils';
import '../styles/calendar.css';

function buildCalendarWeeks(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0 = Sunday
  const daysInMonth = lastDay.getDate();

  const cells = [];

  // Padding from previous month
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push(new Date(year, month - 1, prevMonthLastDay - i));
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(year, month, d));
  }
  // Padding from next month
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push(new Date(year, month + 1, nextDay++));
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function CalendarView() {
  const today = new Date();
  const todayStr = toDateStr(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [sessions, setSessions] = useState([]);
  const [clientRates, setClientRates] = useState({});
  const [totalOwed, setTotalOwed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [subView, setSubView] = useState(null); // null | 'week' | 'day'
  const [selectedWeekStart, setSelectedWeekStart] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/sessions?month=${monthStr}`).then(r => r.json()).catch(() => []),
      fetch('/api/clients').then(r => r.json()).catch(() => []),
      fetch('/api/payments/summary').then(r => r.json()).catch(() => []),
    ]).then(([sessionData, clientData, summaryData]) => {
      setSessions(Array.isArray(sessionData) ? sessionData : []);

      const rates = {};
      (Array.isArray(clientData) ? clientData : []).forEach(c => {
        rates[c.name] = c.rate;
      });
      setClientRates(rates);

      const owed = (Array.isArray(summaryData) ? summaryData : [])
        .reduce((sum, c) => sum + Math.max(0, c.balance_owed), 0);
      setTotalOwed(owed);

      setLoading(false);
    });
  }, [monthStr, refreshKey]);

  const weeks = buildCalendarWeeks(year, month);

  // Group and sort sessions by date
  const sessionsByDate = {};
  sessions.forEach(s => {
    if (!sessionsByDate[s.date]) sessionsByDate[s.date] = [];
    sessionsByDate[s.date].push(s);
  });
  Object.values(sessionsByDate).forEach(list =>
    list.sort((a, b) => a.time.localeCompare(b.time))
  );

  // Summary bar values
  const completed = sessions.filter(s => s.status === 'Completed');
  const scheduled = sessions.filter(s => s.status === 'Scheduled');
  const totalRevenue = completed.reduce(
    (sum, s) => sum + s.duration * (clientRates[s.name] || 0), 0
  );
  const totalHours = scheduled.reduce((sum, s) => sum + s.duration, 0);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  function handleWeekClick(weekStart) {
    setSelectedWeekStart(weekStart);
    setSubView('week');
  }

  function handleDayClick(e, date) {
    e.stopPropagation();
    setSelectedDay(date);
    setSubView('day');
  }

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

  const formatHours = h => (h % 1 === 0 ? `${h}` : h.toFixed(1));

  return (
    <div className="calendar">
      {/* Month navigation */}
      <div className="calendar-header">
        <div />
        <div className="calendar-header-nav">
          <button className="cal-nav-btn" onClick={prevMonth} aria-label="Previous month">‹</button>
          <h2 className="calendar-month-title">{MONTH_NAMES[month]} {year}</h2>
          <button className="cal-nav-btn" onClick={nextMonth} aria-label="Next month">›</button>
        </div>
        <div className="calendar-header-actions">
          <button className="new-session-btn" onClick={() => setNewSessionOpen(true)}>
            + New Session
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="calendar-summary">
        <div className="summary-stat">
          <span className="summary-label">Revenue</span>
          <span className="summary-value">₪{totalRevenue.toLocaleString()}</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <span className="summary-label">Total Owed</span>
          <span className="summary-value summary-value--owed">₪{Math.round(totalOwed).toLocaleString()}</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-stat">
          <span className="summary-label">Hours Scheduled</span>
          <span className="summary-value">{formatHours(totalHours)}h</span>
        </div>
      </div>

      {/* Day-of-week header row */}
      <div className="calendar-dow-row">
        <div className="calendar-dow-label calendar-week-num-header" />
        {DOW_LABELS.map(d => (
          <div key={d} className="calendar-dow-label">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="calendar-loading">Loading…</div>
      ) : (
        <div className="calendar-body">
          {weeks.map((week, wi) => (
            <div key={wi} className="calendar-week">
              <div
                className="calendar-week-num"
                onClick={() => handleWeekClick(week[0])}
                title="Open week view"
              >
                {getISOWeekNumber(week[0])}
              </div>
              {week.map((date, di) => {
                const dateStr = toDateStr(date);
                const isCurrentMonth = date.getMonth() === month;
                const isToday = dateStr === todayStr;
                const daySessions = isCurrentMonth ? (sessionsByDate[dateStr] || []) : [];
                const holiday = JEWISH_HOLIDAYS[dateStr];

                return (
                  <div
                    key={di}
                    className={[
                      'calendar-cell',
                      !isCurrentMonth && 'calendar-cell--other-month',
                      isToday && 'calendar-cell--today',
                    ].filter(Boolean).join(' ')}
                    onClick={e => isCurrentMonth && handleDayClick(e, date)}
                  >
                    <div className="cell-date-num">{date.getDate()}</div>

                    {holiday && (
                      <div className="cell-holiday">{holiday}</div>
                    )}

                    <div className="cell-sessions">
                      {daySessions.map(s => (
                        <div
                          key={`${s.name}-${s.time}`}
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

      {/* Day view modal */}
      {subView === 'day' && selectedDay && (
        <DayView
          date={selectedDay}
          onClose={() => setSubView(null)}
          onNavigate={date => setSelectedDay(date)}
          onSessionCreated={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* New session modal */}
      {newSessionOpen && (
        <NewSessionModal
          onClose={() => setNewSessionOpen(false)}
          onCreated={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}

export default CalendarView;
