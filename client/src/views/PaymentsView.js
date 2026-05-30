/**
 * PaymentsView.js
 *
 * Top-level view for tracking client balances and recording payments.
 *
 * Layout (two sections separated by a divider):
 *   1. Balance owed table — one row per client who owes money. Clicking a row
 *      opens PaymentModal pre-filled with the client and their outstanding balance.
 *      PaymentModal exposes a left-aligned "Create Invoice" button that closes it
 *      and opens PdfModal in invoice mode with the same client pre-selected.
 *   2. Recent payments table — all payments from two months ago through today,
 *      sorted by the server. Clicking a row opens PaymentModal in edit mode.
 *      Edit mode exposes a "Create Receipt" button that opens PdfModal in receipt
 *      mode pre-filled with the payment date.
 *
 * Both datasets are fetched in parallel on mount and on every refresh. The view
 * re-fetches when `refreshKey` is incremented, which happens after any modal save
 * or delete.
 *
 * API routes used:
 *   GET  /api/payments/owed              — Clients with a positive balance owed,
 *                                          including the earliest unpaid session date.
 *   GET  /api/payments?from=YYYY-MM-DD   — Payments on or after the given date.
 */

import React, { useState, useEffect } from 'react';
import PaymentModal from '../components/PaymentModal';
import PdfModal from '../components/PdfModal';
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
 *   loading     {boolean}     — True while the initial parallel fetch is in-flight.
 *   refreshKey  {number}      — Incrementing counter that triggers a re-fetch when changed.
 *   newPayment  {object|null} — When non-null, PaymentModal opens in new-payment mode.
 *                               May carry { initialClientId, initialAmount } if opened from
 *                               a balance row, or {} if opened from the "+ New Payment" button.
 *   editPayment {object|null} — When non-null, PaymentModal opens in edit mode.
 *   pdf         {object|null} — When non-null, PdfModal opens. Shape:
 *                               { mode: 'invoice'|'receipt', clientId, from: string|null }.
 *                               Populated by "Create Invoice" (new payment) or
 *                               "Create Receipt" (edit payment) buttons.
 */
function PaymentsView() {
  const [owed, setOwed]               = useState([]);
  const [payments, setPayments]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshKey, setRefreshKey]   = useState(0);
  const [newPayment, setNewPayment]   = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [pdf, setPdf]                 = useState(null); // null | { mode, clientId, from }

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

      {/* New payment modal */}
      {newPayment !== null && (
        <PaymentModal
          initialClientId={newPayment.initialClientId}
          initialAmount={newPayment.initialAmount}
          onClose={() => setNewPayment(null)}
          onSaved={refresh}
          onCreateInvoice={clientId => {
            setNewPayment(null);
            const owedRow = owed.find(r => r.client_id === clientId);
            setPdf({ mode: 'invoice', clientId, from: owedRow?.earliest_unpaid?.date || null });
          }}
        />
      )}

      {/* Edit payment modal */}
      {editPayment && (
        <PaymentModal
          payment={editPayment}
          onClose={() => setEditPayment(null)}
          onSaved={refresh}
          onDeleted={refresh}
          onCreateReceipt={({ clientId, date }) => {
            setEditPayment(null);
            setPdf({ mode: 'receipt', clientId, from: date });
          }}
        />
      )}

      {/* PdfModal — opened via "Create Invoice" (new payment) or "Create Receipt" (edit payment) */}
      {pdf && (
        <PdfModal
          mode={pdf.mode}
          initialClientId={pdf.clientId}
          initialFrom={pdf.from}
          onClose={() => setPdf(null)}
        />
      )}

    </div>
  );
}

export default PaymentsView;
