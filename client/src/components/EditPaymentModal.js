import React, { useState } from 'react';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';

const METHODS = ['PayBox', 'Bit', 'Transfer', 'Cash', 'Other'];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function EditPaymentModal({ payment, onClose, onUpdated }) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method);
  const [receiptNumber, setReceiptNumber] = useState(payment.receipt_number || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function doSave(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(
        `/api/payments/${encodeURIComponent(payment.name)}/${payment.date}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parseFloat(amount),
            method,
            receipt_number: receiptNumber || null,
          }),
        }
      );
      if (res.ok) {
        onUpdated();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to update payment.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  async function doDelete() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(
        `/api/payments/${encodeURIComponent(payment.name)}/${payment.date}`,
        { method: 'DELETE' }
      );
      if (res.ok || res.status === 204) {
        onUpdated();
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

  if (confirmDelete) {
    return (
      <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
        <div className="modal modal--narrow" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Delete Payment</span>
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="modal-body">
            <p className="confirm-message">
              Delete {payment.name}'s payment of ₪{payment.amount.toLocaleString()} on {formatDate(payment.date)}?
            </p>
            <p className="confirm-warning">This cannot be undone.</p>
            {error && <p className="form-api-error">{error}</p>}
            <div className="modal-actions modal-actions--spread">
              <button className="btn-danger" disabled={submitting} onClick={doDelete}>
                {submitting ? 'Deleting…' : 'Delete'}
              </button>
              <button className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Edit Payment</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="modal-body" onSubmit={doSave}>

          <div className="form-field">
            <label className="form-label">Client</label>
            <div className="form-static">{payment.name}</div>
          </div>

          <div className="form-field">
            <label className="form-label">Date</label>
            <div className="form-static">{formatDate(payment.date)}</div>
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
              {METHODS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

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

          <div className="modal-actions modal-actions--spread">
            <button
              type="button"
              className="btn-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
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

export default EditPaymentModal;
