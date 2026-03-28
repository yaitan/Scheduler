import React, { useState, useEffect, useRef } from 'react';
import DayView from './DayView';
import NewSessionModal from '../components/NewSessionModal';
import EditSessionModal from '../components/EditSessionModal';
import { MONTH_NAMES, DOW_LABELS, toDateStr } from '../utils/dateUtils';
import '../styles/week.css';

const GRID_START = 7;    // first visible hour
const GRID_END   = 24;   // last visible hour (exclusive)
const HOUR_PX    = 32;   // px per hour (shorter than day view)

function timeToOffset(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return (h - GRID_START + m / 60) * HOUR_PX;
}

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function weekLabel(days) {
  const start = days[0];
  const end   = days[6];
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  }
  return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

function WeekView({ weekStart: initialWeekStart, onBack, onSessionCreated }) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [sessions, setSessions]   = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [newSession, setNewSession] = useState(null);  // null | { date, time }
  const [editSession, setEditSession] = useState(null); // null | session object
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef(null);

  const days         = getWeekDays(weekStart);
  const weekStartStr = toDateStr(weekStart);

  // Scroll to ~8:30am on open and on week change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8.5 - GRID_START) * HOUR_PX;
    }
  }, [weekStartStr]);

  useEffect(() => {
    const months    = [...new Set(days.map(d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    ))];
    const weekDates = new Set(days.map(toDateStr));

    Promise.all(
      months.map(m => fetch(`/api/sessions?month=${m}`).then(r => r.json()).catch(() => []))
    ).then(results => {
      setSessions(results.flat().filter(s => weekDates.has(s.date)));
    });
  }, [weekStartStr, refreshKey]);

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  const hours    = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
  const now      = new Date();
  const todayStr = toDateStr(now);
  const nowTop   = (now.getHours() - GRID_START + now.getMinutes() / 60) * HOUR_PX;
  const showNow  = nowTop >= 0 && nowTop <= (GRID_END - GRID_START) * HOUR_PX;

  // Group sessions by date
  const byDate = {};
  sessions.forEach(s => {
    (byDate[s.date] = byDate[s.date] || []).push(s);
  });
  Object.values(byDate).forEach(list => list.sort((a, b) => a.time.localeCompare(b.time)));

  return (
    <div className="week-view">

      {/* Top bar */}
      <div className="week-topbar">
        <button className="week-back-btn" onClick={onBack}>← Month</button>
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
          + New Session
        </button>
      </div>

      {/* Scrollable grid */}
      <div className="week-scroll" ref={scrollRef}>
        <div className="week-inner">

          {/* Sticky time-label column */}
          <div className="week-time-col">
            <div className="week-time-corner" />
            {hours.map((h, i) => (
              <div key={h} className={`week-time-label${i === 0 ? ' week-time-label--first' : ''}`}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((date, di) => {
            const dateStr  = toDateStr(date);
            const isToday  = dateStr === todayStr;
            const daySessions = byDate[dateStr] || [];

            return (
              <div key={di} className={`week-day-col${isToday ? ' week-day-col--today' : ''}`}>

                {/* Day header — click to open day view */}
                <div className="week-day-header" onClick={() => setSelectedDay(date)}>
                  <span className="week-day-name">{DOW_LABELS[date.getDay()]}</span>
                  <span className={`week-day-num${isToday ? ' week-day-num--today' : ''}`}>
                    {date.getDate()}
                  </span>
                </div>

                {/* Time body */}
                <div className="week-day-body">
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

                  {isToday && showNow && (
                    <div className="week-now-line" style={{ top: nowTop }} />
                  )}

                  {daySessions.map(s => (
                    <div
                      key={`${s.name}-${s.time}`}
                      className={`week-session week-session--${s.status.toLowerCase()}`}
                      style={{
                        top:    timeToOffset(s.time),
                        height: Math.max(s.duration * HOUR_PX, 20),
                      }}
                      onClick={e => { e.stopPropagation(); setEditSession(s); }}
                    >
                      <span className="week-session-name">{s.name}</span>
                      <span className="week-session-meta">  {'\u00A0'} {s.time} · {s.duration}h</span>
                    </div>
                  ))}
                </div>

              </div>
            );
          })}

        </div>
      </div>

      {/* Day view modal opened from this week view */}
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
        <EditSessionModal
          session={editSession}
          onClose={() => setEditSession(null)}
          onUpdated={() => { setRefreshKey(k => k + 1); onSessionCreated?.(); }}
        />
      )}

      {/* New session modal */}
      {newSession !== null && (
        <NewSessionModal
          initialDate={newSession.date}
          initialTime={newSession.time}
          onClose={() => setNewSession(null)}
          onCreated={() => { setRefreshKey(k => k + 1); onSessionCreated?.(); }}
        />
      )}

    </div>
  );
}

export default WeekView;
