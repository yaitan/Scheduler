import React, { useState, useEffect, useRef } from 'react';
import { MONTH_NAMES, DOW_FULL, toDateStr } from '../utils/dateUtils';

const GRID_START = 7;    // first visible hour
const GRID_END   = 24;   // last visible hour (exclusive)
const HOUR_PX    = 48;   // px per hour

function timeToOffset(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return (h - GRID_START + m / 60) * HOUR_PX;
}

function DayView({ date, onClose, onNavigate }) {
  const [sessions, setSessions] = useState([]);
  const bodyRef = useRef(null);

  const dateStr  = toDateStr(date);
  const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    fetch(`/api/sessions?month=${monthStr}`)
      .then(r => r.json())
      .then(data => {
        setSessions((Array.isArray(data) ? data : []).filter(s => s.date === dateStr));
      })
      .catch(() => setSessions([]));
  }, [dateStr, monthStr]);

  // Scroll to 8:00 on open
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = (8 - GRID_START) * HOUR_PX - 8;
    }
  }, [date]);

  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onNavigate(d);
  }

  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    onNavigate(d);
  }

  const label = `${DOW_FULL[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  const hours  = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);

  const now = new Date();
  const isToday  = toDateStr(now) === dateStr;
  const nowOffset = (now.getHours() - GRID_START + now.getMinutes() / 60) * HOUR_PX;
  const showNowLine = isToday && nowOffset >= 0 && nowOffset <= (GRID_END - GRID_START) * HOUR_PX;

  return (
    <div className="day-view-overlay" onClick={onClose}>
      <div className="day-view-modal" onClick={e => e.stopPropagation()}>

        <div className="day-view-header">
          <button className="cal-nav-btn" onClick={prevDay} aria-label="Previous day">‹</button>
          <h3 className="day-view-title">{label}</h3>
          <button className="cal-nav-btn" onClick={nextDay} aria-label="Next day">›</button>
          <button className="day-view-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="day-view-body" ref={bodyRef}>
          <div className="day-grid">

            {/* Hour labels */}
            <div className="day-labels">
              {hours.map(h => (
                <div key={h} className="day-label">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Slots + sessions */}
            <div className="day-slots">

              {/* Clickable hour slots */}
              {hours.map(hour => (
                <div
                  key={hour}
                  className="day-slot"
                  onClick={() => { /* TODO: open add-session form pre-filled to this time */ }}
                />
              ))}

              {/* Current time line */}
              {showNowLine && (
                <div className="day-now-line" style={{ top: nowOffset }} />
              )}

              {/* Sessions */}
              {sessions.map(s => (
                <div
                  key={`${s.client_name}-${s.time}`}
                  className={`day-session day-session--${s.status.toLowerCase()}`}
                  style={{
                    top:    timeToOffset(s.time),
                    height: Math.max(s.duration * HOUR_PX, 24),
                  }}
                  onClick={e => { e.stopPropagation(); /* TODO: open edit-session form */ }}
                >
                  <span className="day-session-client">{s.client_name}</span>
                  <span className="day-session-meta">{s.time} · {s.duration}h</span>
                </div>
              ))}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default DayView;
