import React, { useState, useEffect } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/clients.css';
import '../styles/datepicker-theme.css';

function NewSessionModal({ initialDate, initialTime, onClose, onCreated }) {
  const [clients, setClients] = useState([]);
  const [clientName, setClientName] = useState('');
  const [date, setDate] = useState(initialDate ? new Date(initialDate + 'T00:00:00') : null);
  const [time, setTime] = useState(initialTime || '');
  const [duration, setDuration] = useState('1');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [warnings, setWarnings] = useState(null); // null | string[]

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setClients(data); })
      .catch(() => {});
  }, []);

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

  async function doSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: clientName,
          date: toYmd(date),
          time,
          duration: parseFloat(duration),
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setWarnings(null);
        setError(data.error || 'Failed to create session.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!date) { setError('Date is required.'); return; }
    const w = buildWarnings();
    if (w.length > 0) {
      setWarnings(w);
      return;
    }
    doSubmit();
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Session</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>

          <div className="form-field">
            <label className="form-label">
              Client <span className="form-required">*</span>
            </label>
            <select
              className="form-input"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              required
            >
              <option value="" />
              {clients.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
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

          <div className="modal-actions">
            {warnings ? (
              <>
                <button type="button" className="btn-secondary" onClick={() => setWarnings(null)}>
                  Go back
                </button>
                <button type="button" className="btn-primary" disabled={submitting} onClick={doSubmit}>
                  {submitting ? 'Saving…' : 'Proceed anyway'}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? 'Saving…' : 'Schedule'}
                </button>
              </>
            )}
          </div>

        </form>
      </div>
    </div>
  );
}

export default NewSessionModal;
