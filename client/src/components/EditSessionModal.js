import React, { useState } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/clients.css';
import '../styles/datepicker-theme.css';

function EditSessionModal({ session, onClose, onUpdated }) {
  const [date, setDate] = useState(new Date(session.date + 'T00:00:00'));
  const [time, setTime] = useState(session.time);
  const [duration, setDuration] = useState(String(session.duration));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [warnings, setWarnings] = useState(null); // null | string[]
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toYmd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function buildWarnings() {
    const w = [];
    if (date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      if (d < today) w.push('The selected date is in the past.');
    }
    if (time) {
      const h = Number(time.split(':')[0]);
      if (h >= 23 || h < 7) w.push('The selected time is between 11pm and 7am.');
    }
    return w;
  }

  async function doSave() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(session.name)}/${session.date}/${session.time}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: toYmd(date),
            time,
            duration: parseFloat(duration),
            status: session.status,
          }),
        }
      );
      if (res.ok) {
        onUpdated();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setWarnings(null);
        setError(data.error || 'Failed to update session.');
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
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(session.name)}/${session.date}/${session.time}`,
        { method: 'DELETE' }
      );
      if (res.ok || res.status === 204) {
        onUpdated();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setConfirmDelete(false);
        setError(data.error || 'Failed to delete session.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const w = buildWarnings();
    if (w.length > 0) { setWarnings(w); return; }
    doSave();
  }

  // ── Delete confirmation view ──────────────────────────────────
  if (confirmDelete) {
    return (
      <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
        <div className="modal modal--narrow" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-title">Delete Session</span>
            <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="modal-body">
            <p className="confirm-message">
              Delete {session.name}'s session on {session.date} at {session.time}?
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

  // ── Edit form view ────────────────────────────────────────────
  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Edit Session</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>

          <div className="form-field">
            <label className="form-label">Client</label>
            <div className="form-static">{session.name}</div>
          </div>

          <div className="form-field">
            <label className="form-label">
              Date (dd/mm/yyyy) <span className="form-required">*</span>
            </label>
            <ReactDatePicker
              selected={date}
              onChange={d => { setDate(d); setWarnings(null); }}
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
              Time <span className="form-required">*</span>
            </label>
            <input
              type="time"
              className="form-input"
              value={time}
              onChange={e => { setTime(e.target.value); setWarnings(null); }}
              required
            />
          </div>

          <div className="form-field">
            <label className="form-label">
              Duration (hours) <span className="form-required">*</span>
            </label>
            <input
              type="number"
              className="form-input"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              min="0.5"
              max="8"
              step="0.5"
              required
            />
          </div>

          {warnings && (
            <div className="form-warning-box">
              {warnings.map((w, i) => (
                <p key={i} className="form-warning-text">{w}</p>
              ))}
            </div>
          )}

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
              {warnings ? (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setWarnings(null)}>
                    Go back
                  </button>
                  <button type="button" className="btn-primary" disabled={submitting} onClick={doSave}>
                    {submitting ? 'Saving…' : 'Proceed anyway'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-secondary" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}

export default EditSessionModal;
