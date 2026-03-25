import React from 'react';
import { MONTH_NAMES, DOW_FULL } from '../utils/dateUtils';

function DayView({ date, onClose, onNavigate }) {
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

  return (
    <div className="day-view-overlay" onClick={onClose}>
      <div className="day-view-modal" onClick={e => e.stopPropagation()}>
        <div className="day-view-header">
          <button className="cal-nav-btn" onClick={prevDay} aria-label="Previous day">‹</button>
          <h3 className="day-view-title">{label}</h3>
          <button className="cal-nav-btn" onClick={nextDay} aria-label="Next day">›</button>
          <button className="day-view-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="day-view-body">
          <p style={{ color: 'var(--text-secondary)' }}>Day view coming soon.</p>
        </div>
      </div>
    </div>
  );
}

export default DayView;
