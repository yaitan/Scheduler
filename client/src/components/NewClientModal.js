import React, { useState } from 'react';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';

function validateRateField(rate) {
  const r = Number(rate);
  if (!String(rate).trim())           return 'Rate is required.';
  if (!Number.isInteger(r) || r <= 0) return 'Rate must be a positive whole number.';
  return '';
}

function AddClientModal({ onClose, onAdded }) {
  const [form, setForm]         = useState({ name: '', rate: '', phone: '', parent_phone: '' });
  const [errors, setErrors]     = useState({});
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: '' }));
    setApiError('');
  }

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    const rateErr = validateRateField(form.rate);
    if (rateErr) e.rate = rateErr;
    return e;
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         form.name.trim(),
          rate:         Number(form.rate),
          phone:        form.phone.trim()        || null,
          parent_phone: form.parent_phone.trim() || null,
        }),
      });

      if (res.status === 409) { setApiError('A client with that name already exists.'); return; }
      if (!res.ok)            { setApiError('Something went wrong. Please try again.');  return; }

      onAdded();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h3 className="modal-title">Add Client</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit} noValidate>

          <div className="form-field">
            <label className="form-label">Name <span className="form-required">*</span></label>
            <input
              className={`form-input${errors.name ? ' form-input--error' : ''}`}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              autoFocus
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Rate <span className="form-required">*</span></label>
            <input
              className={`form-input${errors.rate ? ' form-input--error' : ''}`}
              type="number"
              min="1"
              value={form.rate}
              onChange={e => set('rate', e.target.value)}
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

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add Client'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

export default AddClientModal;
