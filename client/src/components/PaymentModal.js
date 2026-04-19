/**
 * PaymentModal.js
 *
 * Modal dialog for creating and editing payment records.
 *
 * Used in two modes:
 *   - New payment: opened from the Payments view with optional pre-filled
 *     client and amount (e.g. when the user clicks "Record Payment" from a
 *     client's balance summary). Date defaults to today.
 *   - Edit payment: opened from an existing payment row, pre-populated with
 *     that payment's data. Includes a Delete button that leads to a confirmation step.
 *
 * API routes used:
 *   GET     /api/clients           — Fetch all clients to populate the client dropdown.
 *   POST    /api/payments          — Create a new payment (new-payment mode).
 *   PUT     /api/payments/:id      — Update an existing payment (edit mode).
 *   DELETE  /api/payments/:id      — Delete an existing payment (edit mode).
 */

import React, { useState, useEffect } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';
import { toDateStr } from '../utils/dateUtils';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import '../styles/datepicker-theme.css';

/**
 * Allowed payment methods, displayed in the Method dropdown in this order.
 * To add a new method, append it here — no JSX changes needed.
 * NOTE: Keep in sync with VALID_METHODS in server/routes/payments.js.
 */
const METHODS = ['PayBox', 'Bit', 'Transfer', 'Cash', 'Other'];

/**
 * PaymentModal
 *
 * Props:
 *   payment          {object|null} — Existing payment object when editing; null for new.
 *   initialClientId  {number|null} — Client ID to pre-select for new payments (e.g. when
 *                                    opened from a client's record). Null leaves the
 *                                    dropdown empty.
 *   initialAmount    {number|null} — Amount to pre-fill for new payments (e.g. the client's
 *                                    outstanding balance). Null leaves the field empty.
 *   onClose          {Function}    — Called to close the modal without saving.
 *   onSaved          {Function}    — Called after a successful create or update.
 *   onDeleted        {Function}    — Called after a successful delete.
 *
 * States:
 *   clients        {Array}   — List of all clients fetched from GET /api/clients on mount,
 *                              used to populate the client dropdown.
 *   clientId       {string}  — The selected client's ID as a string (matches <select> value).
 *   date           {Date}    — The selected payment date. Defaults to today for new payments.
 *   amount         {string}  — Payment amount as a string (kept as string to match input value).
 *   method         {string}  — Selected payment method from the METHODS list, or '' if unset.
 *   receiptNumber  {string}  — Optional receipt or reference number. Sent as null if empty.
 *   error          {string}  — Error message shown below the form on API or network failure.
 *   submitting     {boolean} — True while an API request is in-flight; disables buttons.
 *   confirmDelete  {boolean} — When true, renders the delete confirmation screen instead
 *                              of the main form.
 */
function PaymentModal({ payment, initialClientId, initialAmount, onClose, onSaved, onDeleted }) {
  const isEdit = Boolean(payment);

  const [clients, setClients] = useState([]);

  // Pre-select the client if an initialClientId was provided (new payment from a client's page).
  const [clientId, setClientId] = useState(
    isEdit ? String(payment.client_id) : (initialClientId != null ? String(initialClientId) : '')
  );

  // New payments default to today; edited payments restore their saved date.
  // Append 'T00:00:00' to treat the YYYY-MM-DD string as local midnight,
  // preventing timezone offset from shifting the displayed date by one day.
  const [date, setDate] = useState(
    isEdit ? new Date(payment.date + 'T00:00:00') : new Date()
  );

  // Pre-fill amount if provided (e.g. balance owed), otherwise start empty.
  const [amount, setAmount] = useState(
    isEdit ? String(payment.amount) : (initialAmount != null ? String(initialAmount) : '')
  );

  const [method, setMethod]               = useState(isEdit ? payment.method : '');
  const [receiptNumber, setReceiptNumber] = useState(isEdit ? (payment.receipt_number || '') : '');
  const [error, setError]                 = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /**
   * GET /api/clients
   * Fetches the full client list on mount so the dropdown is populated.
   */
  useEffect(() => {
    apiFetch('/api/clients')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setClients(data); })
      .catch(() => {});
  }, []);

  /**
   * POST /api/payments    (new payment)
   * PUT  /api/payments/:id  (edit payment)
   *
   * Sends the create or update request to the API.
   * Receipt number is sent as null when left blank — the API stores it as a
   * nullable string rather than an empty string.
   *
   * On success: calls onSaved() and onClose() to refresh the parent and close.
   * On failure: sets the error state with the server's error message or a fallback.
   *
   * @param {React.FormEvent} e - The form's submit event.
   */
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(
        isEdit ? `/api/payments/${payment.id}` : '/api/payments',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:      parseInt(clientId),
            date:           toDateStr(date),
            amount:         parseFloat(amount),
            method,
            receipt_number: receiptNumber || null,
          }),
        }
      );
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to ${isEdit ? 'update' : 'create'} payment.`);
      }
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * DELETE /api/payments/:id
   *
   * Sends the delete request for the current payment.
   * Only reachable after the user confirms in the delete confirmation view.
   *
   * On success (200 or 204): calls onDeleted() and onClose().
   * On failure: dismisses the confirm view and shows an error message.
   */
  async function handleDelete() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(`/api/payments/${payment.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        onDeleted();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setConfirmDelete(false);
        setError(data.error || 'Failed to delete payment.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Delete confirmation view ────────────────────────────────────────────────
  // Shown instead of the main form when the user clicks the Delete button.
  if (confirmDelete) {
    return (
      <ConfirmDeleteModal
        title="Delete Payment"
        message={`Delete ${payment.name}'s payment of ₪${payment.amount.toLocaleString()}?`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        onClose={onClose}
        submitting={submitting}
        error={error}
        zIndex={300}
      />
    );
  }

  // ─── Main form view ──────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
      {/* stopPropagation prevents the overlay click-to-close from firing when
          the user clicks inside the modal itself. */}
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{isEdit ? 'Edit Payment' : 'New Payment'}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>

          <div className="form-field">
            <label className="form-label">
              Client <span className="form-required">*</span>
            </label>
            <select
              className="form-input"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              required
            >
              <option value="" />
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Date picker — Saturdays receive a special CSS class for visual distinction */}
          <div className="form-field">
            <label className="form-label">
              Date (dd/mm/yyyy) <span className="form-required">*</span>
            </label>
            <ReactDatePicker
              selected={date}
              onChange={d => setDate(d)}
              dateFormat="dd/MM/yyyy"
              dayClassName={d => d.getDay() === 6 ? 'rdp-saturday' : undefined}
              placeholderText=""
              autoComplete="off"
              wrapperClassName="dp-wrapper"
              className="form-input"
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label">
              Amount <span className="form-required">*</span>
            </label>
            <input
              type="number"
              className="form-input"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min="0"
              step="1"
              required
            />
          </div>

          {/* Method dropdown — options driven by the METHODS constant above */}
          <div className="form-field">
            <label className="form-label">
              Method <span className="form-required">*</span>
            </label>
            <select
              className="form-input"
              value={method}
              onChange={e => setMethod(e.target.value)}
              required
            >
              <option value="" />
              {METHODS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Receipt number is optional — empty string is converted to null before sending */}
          <div className="form-field">
            <label className="form-label">Receipt Number</label>
            <input
              type="text"
              className="form-input"
              value={receiptNumber}
              onChange={e => setReceiptNumber(e.target.value)}
            />
          </div>

          {error && <p className="form-api-error">{error}</p>}

          {/* Edit mode: spread layout so Delete sits on the far left */}
          <div className={`modal-actions${isEdit ? ' modal-actions--spread' : ''}`}>
            {isEdit && (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}

export default PaymentModal;
