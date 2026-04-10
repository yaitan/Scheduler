import { MONTH_NAMES } from '../utils/dateUtils';
import '../styles/clients.css';
import '../styles/yearly-summary.css';

function YearlySummaryModal({ year, monthlyData, onClose, onMonthClick }) {
  const yearRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
  const yearHours = monthlyData.reduce((s, m) => s + m.hours, 0);

  const formatHours = h => parseFloat(h.toFixed(2)).toString();

  // 3 columns × 4 rows
  const rows = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content yearly-summary-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{year} Summary</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          {/* Yearly totals */}
          <div className="yearly-totals">
            <div className="yearly-total-item">
              <span className="yearly-total-label">Revenue</span>
              <span className="yearly-total-value yearly-total-value--revenue">
                ₪{Math.round(yearRevenue).toLocaleString()}
              </span>
            </div>
            <div className="yearly-total-divider" />
            <div className="yearly-total-item">
              <span className="yearly-total-label">Hours</span>
              <span className="yearly-total-value">
                {formatHours(yearHours)}
              </span>
            </div>
          </div>

          {/* 3×4 month grid */}
          <div className="yearly-month-grid">
            {rows.map((row, ri) => (
              <div key={ri} className="yearly-month-row">
                {row.map(mi => (
                  <div key={mi} className="yearly-month-card" onClick={() => onMonthClick(mi)}>
                    <div className="yearly-month-name">{MONTH_NAMES[mi]}</div>
                    <div className="yearly-month-card-divider" />
                    <span className="yearly-month-stat-value yearly-month-stat-value--revenue">
                      ₪{Math.round(monthlyData[mi].revenue).toLocaleString()}
                    </span>
                    
                    <span className="yearly-month-stat-value">
                      {formatHours(monthlyData[mi].hours)}{'\u202F'}h{/*thin space */}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default YearlySummaryModal;
