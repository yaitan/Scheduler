import React, { useState } from 'react';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';

function validateRateField(rate) {
  const r = Number(rate);
  if (!String(rate).trim())           return 'Rate is required.';
  if (!Number.isInteger(r) || r <= 0) return 'Rate must be a positive whole number.';
  return '';
}

function DeleteConfirmModal({ clientName, onCancel, onDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError]     = useState('');

  async function handleDelete() {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/clients/${encodeURIComponent(clientName)}`, { method: 'DELETE' });
      if (!res.ok) { setApiError('Something went wrong. Please try again.'); return; }
      onDeleted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal--narrow" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h3 className="modal-title">Delete Client</h3>
          <button className="modal-close" onClick={onCancel} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <p className="confirm-message">
            Are you sure you want to delete <strong>{clientName}</strong>?
          </p>
          <p className="confirm-warning">
            This will permanently delete all sessions and payments associated with this client.
          </p>

          {apiError && <p className="form-api-error">{apiError}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={submitting}>
              {submitting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function UpdateClientModal({ client, onClose, onUpdated, onDeleted }) {
  const [form, setForm]         = useState({
    rate:         String(client.rate),
    phone:        client.phone        ?? '',
    parent_phone: client.parent_phone ?? '',
  });
  const [errors, setErrors]       = useState({});
  const [apiError, setApiError]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: '' }));
    setApiError('');
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const rateErr = validateRateField(form.rate);
    if (rateErr) { setErrors({ rate: rateErr }); return; }

    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/clients/${encodeURIComponent(client.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rate:         Number(form.rate),
          phone:        form.phone.trim()        || null,
          parent_phone: form.parent_phone.trim() || null,
        }),
      });

      if (!res.ok) { setApiError('Something went wrong. Please try again.'); return; }

      onUpdated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>

          <div className="modal-header">
            <h3 className="modal-title">Update Client Info</h3>
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <form className="modal-body" onSubmit={handleSubmit} noValidate>

            <div className="form-field">
              <label className="form-label">Name</label>
              <p className="form-static">{client.name}</p>
            </div>

            <div className="form-field">
              <label className="form-label">Rate <span className="form-required">*</span></label>
              <input
                className={`form-input${errors.rate ? ' form-input--error' : ''}`}
                type="number"
                min="1"
                value={form.rate}
                onChange={e => set('rate', e.target.value)}
                autoFocus
              />
              {errors.rate && <span className="form-error">{errors.rate}</span>}
            </div>

            <div className="form-field">
              <label className="form-label">Phone</label>
              <input
                className="form-input"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="form-label">Parent Phone</label>
              <input
                className="form-input"
                value={form.parent_phone}
                onChange={e => set('parent_phone', e.target.value)}
              />
            </div>

            {apiError && <p className="form-api-error">{apiError}</p>}

            <div className="modal-actions modal-actions--spread">
              <button type="button" className="btn-danger" onClick={() => setShowConfirm(true)}>
                Delete
              </button>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>

          </form>
        </div>
      </div>

      {showConfirm && (
        <DeleteConfirmModal
          clientName={client.name}
          onCancel={() => setShowConfirm(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

export default UpdateClientModal;
