import React from 'react';
import { MONTH_NAMES, DOW_LABELS } from '../utils/dateUtils';

function WeekView({ weekStart, onBack, onDayClick }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const weekLabel = (() => {
    const start = days[0];
    const end = days[6];
    if (start.getMonth() === end.getMonth()) {
      return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  })();

  return (
    <div className="view-placeholder">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            padding: '6px 14px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ← Month
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>{weekLabel}</h2>
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
        Week view coming soon. Days in this week:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {days.map((date, i) => (
          <button
            key={i}
            onClick={() => onDayClick(date)}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '10px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 14,
            }}
          >
            {DOW_LABELS[date.getDay()]} — {MONTH_NAMES[date.getMonth()]} {date.getDate()}
          </button>
        ))}
      </div>
    </div>
  );
}

export default WeekView;
