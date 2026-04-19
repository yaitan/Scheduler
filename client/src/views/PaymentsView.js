/**
 * PaymentsView.js
 *
 * Top-level view for tracking client balances and recording payments.
 *
 * Layout (two sections separated by a divider):
 *   1. Balance owed table — one row per client who owes money. Clicking a row
 *      opens PaymentModal pre-filled with that client's ID and outstanding amount,
 *      making it fast to record a payment against a specific balance.
 *   2. Recent payments table — all payments from two months ago through today,
 *      sorted by the server. Clicking a row opens PaymentModal in edit mode.
 *
 * Both datasets are fetched in parallel on mount and on every refresh. The view
 * re-fetches when `refreshKey` is incremented, which happens after any modal save
 * or delete.
 *
 * API routes used:
 *   GET  /api/payments/owed          — Clients with a positive balance owed, including
 *                                      the earliest unpaid session date.
 *   GET  /api/payments?from=YYYY-MM-DD — Payments on or after the given date.
 */

import React, { useState, useEffect } from 'react';
import PaymentModal from '../components/PaymentModal';
import '../styles/clients.css';
import '../styles/payments.css';
import { apiFetch } from '../utils/api';
import { fmtDuration, formatDate, twoMonthsAgoStart } from '../utils/dateUtils';

/**
 * PaymentsView
 *
 * States:
 *   owed        {Array}       — Clients with outstanding balances, from GET /api/payments/owed.
 *                               Each entry has: client_id, name, balance_owed, minutes_owed,
 *                               earliest_unpaid { date }.
 *   payments    {Array}       — Recent payment records from GET /api/payments?from=...,
 *                               each with: id, name, date, amount, method.
 *   loading     {boolean}     — True while the initial parallel fetch is in-flight. The view
 *                               renders nothing while loading to avoid a flash of empty tables.
 *   refreshKey  {number}      — Incrementing counter that triggers a re-fetch when changed.
 *                               Incremented after any modal save or delete.
 *   newPayment  {object|null} — When non-null, PaymentModal opens in new-payment mode.
 *                               May carry { initialClientId, initialAmount } if opened from
 *                               a balance row, or {} if opened from the "+ New Payment" button.
 *   editPayment {object|null} — When non-null, PaymentModal opens in edit mode with this
 *                               payment object.
 */
function PaymentsView() {
  const [owed, setOwed]       = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newPayment, setNewPayment]   = useState(null); // null | { initialClientId?, initialAmount? }
  const [editPayment, setEditPayment] = useState(null); // null | payment object

  /**
   * GET /api/payments/owed
   * GET /api/payments?from=YYYY-MM-DD
   *
   * Fetches both datasets in parallel. Using Promise.all ensures the view
   * only exits the loading state once both requests are complete.
   */
  useEffect(() => {
    setLoading(true);
    const from = twoMonthsAgoStart();
    Promise.all([
      apiFetch('/api/payments/owed').then(r => r.json()).catch(() => []),
      apiFetch(`/api/payments?from=${from}`).then(r => r.json()).catch(() => []),
    ]).then(([owedData, paymentsData]) => {
      setOwed(Array.isArray(owedData) ? owedData : []);
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
    }).finally(() => setLoading(false));
  }, [refreshKey]);

  /** Increments refreshKey to trigger a re-fetch after a modal action. */
  function refresh() { setRefreshKey(k => k + 1); }

  // Render nothing while loading to prevent a jarring empty-state flash.
  if (loading) return null;

  return (
    <div className="payments-view">

      {/* ── Balance owed section ─────────────────────────────────────────── */}
      <div className="payments-topbar">
        <h2 className="payments-section-title">Clients</h2>
        <button className="clients-add-btn" onClick={() => setNewPayment({})}>
          + New Payment
        </button>
      </div>

      {owed.length === 0 ? (
        <div className="clients-empty">No outstanding balances.</div>
      ) : (
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Client</th>
                <th className="col-num">Balance Owed</th>
                <th className="col-num">Time Owed</th>
                <th className="col-num">Earliest Unpaid Session</th>
              </tr>
            </thead>
            <tbody>
              {owed.map(row => (
                // Clicking a balance row pre-fills the new-payment modal with
                // this client's ID and exact balance so the user can record the
                // payment in one click.
                <tr
                  key={row.client_id}
                  onClick={() => setNewPayment({
                    initialClientId: row.client_id,
                    initialAmount:   Math.round(row.balance_owed),
                  })}
                >
                  <td>{row.name}</td>
                  <td className="col-num balance--owed">
                    ₪{Math.round(row.balance_owed).toLocaleString()}
                  </td>
                  <td className="col-num">{fmtDuration(row.minutes_owed)}</td>
                  <td className="payments-unpaid-date">
                    {row.earliest_unpaid ? formatDate(row.earliest_unpaid.date) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="payments-divider" />

      {/* ── Recent payments section ──────────────────────────────────────── */}
      <h2 className="payments-section-title">Payments</h2>
      {payments.length === 0 ? (
        <div className="clients-empty">No payments in the last 2 months.</div>
      ) : (
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Date</th>
                <th className="col-num">Amount</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} onClick={() => setEditPayment(p)}>
                  <td>{p.name}</td>
                  <td>{formatDate(p.date)}</td>
                  <td className="col-num">₪{p.amount.toLocaleString()}</td>
                  <td className="payments-method">{p.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New payment modal — opened either from the button (no pre-fill)
          or from a balance row (pre-filled client + amount) */}
      {newPayment !== null && (
        <PaymentModal
          initialClientId={newPayment.initialClientId}
          initialAmount={newPayment.initialAmount}
          onClose={() => setNewPayment(null)}
          onSaved={refresh}
        />
      )}

      {/* Edit payment modal */}
      {editPayment && (
        <PaymentModal
          payment={editPayment}
          onClose={() => setEditPayment(null)}
          onSaved={refresh}
          onDeleted={refresh}
        />
      )}

    </div>
  );
}

export default PaymentsView;
