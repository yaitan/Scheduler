import React, { useState, useEffect } from 'react';
import '../styles/clients.css';

function fmt(n, decimals = 1) {
  return Number(n).toFixed(decimals);
}

function BalanceCell({ value }) {
  const n = Number(value);
  if (n > 0)  return <td className="col-num balance--owed">₪{fmt(n, 2)}</td>;
  if (n < 0)  return <td className="col-num balance--credit">₪{fmt(Math.abs(n), 2)}</td>;
  return <td className="col-num balance--zero">₪0</td>;
}

function validateRateField(rate) {
  const r = Number(rate);
  if (!String(rate).trim())                return 'Rate is required.';
  if (!Number.isInteger(r) || r <= 0)      return 'Rate must be a positive whole number.';
  return '';
}

function AddClientModal({ onClose, onAdded }) {
  const [form, setForm]       = useState({ name: '', rate: '', phone: '', parent_phone: '' });
  const [errors, setErrors]   = useState({});
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
      const res = await fetch('/api/clients', {
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
            <label className="form-label">Rate  <span className="form-required">*</span></label>
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

function DeleteConfirmModal({ clientName, onCancel, onDeleted }) {
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError]     = useState('');

  async function handleDelete() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientName)}`, { method: 'DELETE' });
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
  const [form, setForm]       = useState({
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
      const res = await fetch(`/api/clients/${encodeURIComponent(client.name)}`, {
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
            <label className="form-label">Rate  <span className="form-required">*</span></label>
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

function ClientsView() {
  const [clients, setClients]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editClient, setEditClient]   = useState(null);

  function loadClients() {
    fetch('/api/clients')
      .then(r => r.json())
      .then(data => { setClients(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(loadClients, []);

  return (
    <div className="clients-view">

      <div className="clients-topbar">
        <h2 className="clients-title">Clients</h2>
        <button className="clients-add-btn" onClick={() => setShowAddForm(true)}>
          + Add Client
        </button>
      </div>

      <div className="clients-table-wrap">
        {loading ? (
          <div className="clients-empty">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="clients-empty">No clients yet. Add one to get started.</div>
        ) : (
          <table className="clients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="col-num">Balance</th>
                <th className="col-num">Rate</th>
                <th className="col-num">Hours Scheduled</th>
                <th className="col-num">Hours Completed</th>
                <th className="col-num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.name} onClick={() => setEditClient(c)}>
                  <td>{c.name}</td>
                  <BalanceCell value={c.balance_owed} />
                  <td className="col-num">₪{fmt(c.rate, 0)}</td>
                  <td className="col-num">{fmt(c.scheduled_hours)}</td>
                  <td className="col-num">{fmt(c.total_hours)}</td>
                  <td className="col-num">₪{fmt(c.total_revenue, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddForm && (
        <AddClientModal
          onClose={() => setShowAddForm(false)}
          onAdded={() => { setShowAddForm(false); loadClients(); }}
        />
      )}

      {editClient && (
        <UpdateClientModal
          client={editClient}
          onClose={() => setEditClient(null)}
          onUpdated={() => { setEditClient(null); loadClients(); }}
          onDeleted={() => { setEditClient(null); loadClients(); }}
        />
      )}

    </div>
  );
}

export default ClientsView;
