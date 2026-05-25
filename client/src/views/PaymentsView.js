/**
 * PaymentsView.js
 *
 * Top-level view for tracking client balances and recording payments.
 *
 * Layout (two sections separated by a divider):
 *   1. Balance owed table — one row per client who owes money. Clicking a row
 *      opens a floating action menu with two options:
 *        • Log Payment  — opens PaymentModal pre-filled with client + amount.
 *        • Create Invoice — downloads a PDF invoice via GET /api/pdf/invoice,
 *          using the earliest unpaid session date as the start of the billing
 *          period and today as the end.
 *   2. Recent payments table — all payments from two months ago through today,
 *      sorted by the server. Clicking a row opens PaymentModal in edit mode.
 *
 * Both datasets are fetched in parallel on mount and on every refresh. The view
 * re-fetches when `refreshKey` is incremented, which happens after any modal save
 * or delete.
 *
 * API routes used:
 *   GET  /api/payments/owed              — Clients with a positive balance owed,
 *                                          including the earliest unpaid session date.
 *   GET  /api/payments?from=YYYY-MM-DD   — Payments on or after the given date.
 *   GET  /api/pdf/invoice?...            — Streams a PDF invoice; called with apiFetch
 *                                          so the JWT bearer token is included.
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
 *   loading     {boolean}     — True while the initial parallel fetch is in-flight.
 *   refreshKey  {number}      — Incrementing counter that triggers a re-fetch when changed.
 *   newPayment  {object|null} — When non-null, PaymentModal opens in new-payment mode.
 *                               May carry { initialClientId, initialAmount } if opened from
 *                               a balance row, or {} if opened from the "+ New Payment" button.
 *   editPayment {object|null} — When non-null, PaymentModal opens in edit mode.
 *   actionMenu  {object|null} — The floating action menu state. Non-null while the menu is
 *                               open: { row, x, y } where row is the owed-table row and
 *                               x/y are the cursor coordinates used to position the popup.
 *   invoiceError {string|null} — Non-null when a PDF generation request fails; shown as an
 *                               inline error below the clients table.
 */
function PaymentsView() {
  const [owed, setOwed]               = useState([]);
  const [payments, setPayments]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshKey, setRefreshKey]   = useState(0);
  const [newPayment, setNewPayment]   = useState(null);
  const [editPayment, setEditPayment] = useState(null);
  const [actionMenu, setActionMenu]   = useState(null); // null | { row, x, y }
  const [invoiceError, setInvoiceError] = useState(null);

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

  /**
   * Opens the floating action menu anchored near the cursor position.
   * stopPropagation prevents the click from bubbling to any parent handlers.
   *
   * @param {React.MouseEvent} e
   * @param {object}           row  — The owed-table row object for this client.
   */
  function openActionMenu(e, row) {
    e.stopPropagation();
    setInvoiceError(null);
    setActionMenu({ row, x: e.clientX, y: e.clientY });
  }

  /**
   * GET /api/pdf/invoice
   *
   * Generates and downloads a PDF invoice for the given client. Uses apiFetch
   * so the JWT bearer token is included in the request — a bare <a href> or
   * window.open() would not send the Authorization header.
   *
   * The billing period runs from the client's earliest unpaid session to today.
   * The invoice number is auto-generated as YYYYMMDD-clientId.
   *
   * @param {object} row  — The owed-table row (client_id, earliest_unpaid, etc.).
   */
  async function downloadInvoice(row) {
    setActionMenu(null);
    setInvoiceError(null);

    const today         = new Date().toISOString().slice(0, 10);
    const from          = row.earliest_unpaid?.date || today;
    const invoiceNumber = `${today.replace(/-/g, '')}-${row.client_id}`;

    const params = new URLSearchParams({
      client_id:      row.client_id,
      from,
      to:             today,
      invoice_number: invoiceNumber,
      tax_rate:       0,
    });

    try {
      const res = await apiFetch(`/api/pdf/invoice?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setInvoiceError(body.error || 'Failed to generate invoice.');
        return;
      }
      // Trigger a file download by creating a temporary object URL.
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `invoice-${invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setInvoiceError('Failed to generate invoice. Check your connection and try again.');
    }
  }

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
                <tr key={row.client_id} onClick={e => openActionMenu(e, row)}>
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

      {invoiceError && (
        <div className="payments-invoice-error">{invoiceError}</div>
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

      {/* ── Floating action menu ─────────────────────────────────────────── */}
      {actionMenu && (
        <>
          {/* Invisible full-screen layer that closes the menu on outside click */}
          <div
            className="action-menu-backdrop"
            onClick={() => setActionMenu(null)}
          />
          <div
            className="action-menu"
            style={{ top: actionMenu.y, left: actionMenu.x }}
          >
            <button
              className="action-menu-item"
              onClick={() => {
                setActionMenu(null);
                setNewPayment({
                  initialClientId: actionMenu.row.client_id,
                  initialAmount:   Math.round(actionMenu.row.balance_owed),
                });
              }}
            >
              Log Payment
            </button>
            <button
              className="action-menu-item"
              onClick={() => downloadInvoice(actionMenu.row)}
            >
              Create Invoice
            </button>
          </div>
        </>
      )}

      {/* New payment modal */}
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
