/**
 * YearlySummaryModal.js
 *
 * Read-only modal displaying a full-year revenue and hours summary.
 *
 * Layout:
 *   - A header row showing total revenue and total hours for the year.
 *   - A 3-column × 4-row grid of month cards, one per calendar month.
 *     Each card shows the month's revenue and hours and is clickable to
 *     navigate to that month in the Payments view.
 *
 * This component is purely presentational — it receives pre-aggregated data
 * from the parent (ClientsView) and makes no API calls of its own.
 */

import { MONTH_NAMES, fmtDuration } from '../utils/dateUtils';
import '../styles/clients.css';
import '../styles/yearly-summary.css';

/**
 * YearlySummaryModal
 *
 * Props:
 *   year         {number}   — The calendar year being displayed (e.g. 2025).
 *                             Used only as the modal title.
 *   monthlyData  {Array}    — Array of 12 objects, one per month (index 0 = January).
 *                             Each object has:
 *                               revenue {number} — Total revenue in ₪ for the month.
 *                               minutes {number} — Total session minutes for the month.
 *   onClose      {Function} — Called when the user clicks the backdrop or close button.
 *   onMonthClick {Function} — Called with a month index (0–11) when the user clicks
 *                             a month card. The parent uses this to navigate to that
 *                             month in the Payments view.
 */
function YearlySummaryModal({ year, monthlyData, onClose, onMonthClick }) {
  // Sum revenue and minutes across all 12 months for the yearly totals header.
  const yearRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
  const yearMinutes = monthlyData.reduce((s, m) => s + m.minutes, 0);

  // Define the 3-column × 4-row grid layout as groups of month indices.
  // Row 0: Jan–Mar, Row 1: Apr–Jun, Row 2: Jul–Sep, Row 3: Oct–Dec.
  const rows = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];

  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* stopPropagation prevents the overlay click-to-close from firing when
          the user clicks inside the modal itself. */}
      <div className="modal-content yearly-summary-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{year} Summary</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">

          {/* ── Yearly totals bar ──────────────────────────────────────────── */}
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
                {fmtDuration(yearMinutes)}
              </span>
            </div>
          </div>

          {/* ── 3×4 month grid ────────────────────────────────────────────── */}
          {/* Iterates over the row groups, then over each month index within a row. */}
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
                      {fmtDuration(monthlyData[mi].minutes)}
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
