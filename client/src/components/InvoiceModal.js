/**
 * InvoiceModal.js
 *
 * Modal for configuring and downloading a PDF invoice for a client.
 *
 * The user selects a client, optionally edits the billing name, and sets a
 * date range. The modal queries the sessions count for the chosen parameters
 * so the user can confirm they are invoicing the right period before downloading.
 * Pressing "Download" streams the PDF via GET /api/pdf/invoice and triggers a
 * browser file download.
 *
 * API routes used:
 *   GET  /api/clients                                — Populate the client dropdown.
 *   GET  /api/sessions?client_id=&from=&to=          — Count sessions in the range.
 *   GET  /api/pdf/invoice?client_id=&from=&to=...    — Stream the PDF for download.
 *
 * Exports:
 *   InvoiceModal  — The modal component.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/clients.css';
import '../styles/datepicker-theme.css';
import { apiFetch } from '../utils/api';
import { toDateStr } from '../utils/dateUtils';

/**
 * InvoiceModal
 *
 * Props:
 *   initialClientId  {number|null}  — Pre-select this client when the modal opens.
 *   initialFrom      {string|null}  — Pre-fill the "From" date (YYYY-MM-DD).
 *   initialTo        {string|null}  — Pre-fill the "To" date (YYYY-MM-DD).
 *   onClose          {Function}     — Called to close the modal.
 *
 * States:
 *   clients       {Array}        — All clients from GET /api/clients; populates dropdown.
 *   clientId      {string}       — Selected client ID as a string.
 *   billingName   {string}       — Billing name to print on the invoice. Auto-filled
 *                                  from the client's stored billing_name (or name).
 *                                  The user can override it before downloading.
 *   from          {Date|null}    — Start of the billing period.
 *   to            {Date|null}    — End of the billing period.
 *   sessionCount  {number|null}  — Sessions found in the range; null while loading
 *                                  or when not all fields are filled.
 *   countLoading  {boolean}      — True while the session count fetch is in-flight.
 *   downloading   {boolean}      — True while the PDF request is in-flight.
 *   error         {string}       — Error message shown below the form.
 */
function InvoiceModal({ initialClientId, initialFrom, initialTo, onClose }) {
  const [clients, setClients]           = useState([]);
  const [clientId, setClientId]         = useState(initialClientId != null ? String(initialClientId) : '');
  const [billingName, setBillingName]   = useState('');
  const [from, setFrom]                 = useState(
    initialFrom ? new Date(initialFrom + 'T00:00:00') : null
  );
  const [to, setTo]                     = useState(
    initialTo ? new Date(initialTo + 'T00:00:00') : new Date()
  );
  const [sessionCount, setSessionCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);
  const [downloading, setDownloading]   = useState(false);
  const [error, setError]               = useState('');

  /**
   * GET /api/clients
   * Fetches all clients on mount so the dropdown is populated and billing name
   * can be auto-filled when a client is pre-selected via initialClientId.
   */
  useEffect(() => {
    apiFetch('/api/clients')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        setClients(data);
        if (initialClientId != null) {
          const c = data.find(c => c.id === initialClientId);
          if (c) setBillingName(c.billing_name || c.name || '');
        }
      })
      .catch(() => {});
  }, []);  // initialClientId is intentionally read only on mount

  /**
   * When the selected client changes, auto-fill billingName from that client's
   * stored billing_name (falling back to their display name).
   */
  useEffect(() => {
    if (!clientId) { setBillingName(''); return; }
    const c = clients.find(c => String(c.id) === clientId);
    if (c) setBillingName(c.billing_name || c.name || '');
  }, [clientId, clients]);

  /**
   * GET /api/sessions?client_id=&from=&to=
   *
   * Re-runs whenever client, from, or to change. Counts the sessions that fall
   * in the selected range so the user knows what will be invoiced before they
   * commit to downloading.
   */
  const fetchCount = useCallback(() => {
    if (!clientId || !from || !to) { setSessionCount(null); return; }
    setCountLoading(true);
    const params = new URLSearchParams({
      client_id: clientId,
      from:      toDateStr(from),
      to:        toDateStr(to),
    });
    apiFetch(`/api/sessions?${params}`)
      .then(r => r.json())
      .then(data => setSessionCount(Array.isArray(data) ? data.length : null))
      .catch(() => setSessionCount(null))
      .finally(() => setCountLoading(false));
  }, [clientId, from, to]);

  useEffect(() => { fetchCount(); }, [fetchCount]);

  /**
   * GET /api/pdf/invoice
   *
   * Requests the PDF from the server and triggers a browser file download via
   * a temporary object URL. apiFetch is used (rather than a bare anchor tag)
   * so the JWT Authorization header is included in the request.
   *
   * Closes the modal on success.
   */
  async function handleDownload() {
    if (!clientId || !from || !to) return;
    setDownloading(true);
    setError('');
    const params = new URLSearchParams({
      client_id: clientId,
      from:      toDateStr(from),
      to:        toDateStr(to),
    });
    if (billingName) params.set('billing_name', billingName);
    try {
      const res = await apiFetch(`/api/pdf/invoice?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to generate invoice.');
        return;
      }
      // Derive the filename from Content-Disposition, fall back to a safe default.
      const disposition = res.headers.get('Content-Disposition') || '';
      const match       = disposition.match(/filename="?([^";\s]+)"?/);
      const filename    = match ? match[1] : 'invoice.pdf';
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError('Failed to generate invoice. Check your connection and try again.');
    } finally {
      setDownloading(false);
    }
  }

  // ─── Main form ───────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" style={{ zIndex: 300 }} onClick={onClose}>
      {/* stopPropagation prevents the overlay click-to-close from firing when
          the user clicks inside the modal itself. */}
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Create Invoice</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">

          <div className="form-field">
            <label className="form-label">
              Client <span className="form-required">*</span>
            </label>
            <select
              className="form-input"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
            >
              <option value="" />
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="form-label">Billing Name</label>
            <input
              type="text"
              className="form-input"
              value={billingName}
              onChange={e => setBillingName(e.target.value)}
              placeholder="Defaults to client name"
            />
          </div>

          <div className="form-field">
            <label className="form-label">
              From <span className="form-required">*</span>
            </label>
            <ReactDatePicker
              selected={from}
              onChange={d => setFrom(d)}
              dateFormat="dd/MM/yyyy"
              dayClassName={d => d.getDay() === 6 ? 'rdp-saturday' : undefined}
              placeholderText="dd/mm/yyyy"
              autoComplete="off"
              wrapperClassName="dp-wrapper"
              className="form-input"
            />
          </div>

          <div className="form-field">
            <label className="form-label">
              To <span className="form-required">*</span>
            </label>
            <ReactDatePicker
              selected={to}
              onChange={d => setTo(d)}
              dateFormat="dd/MM/yyyy"
              dayClassName={d => d.getDay() === 6 ? 'rdp-saturday' : undefined}
              placeholderText="dd/mm/yyyy"
              autoComplete="off"
              wrapperClassName="dp-wrapper"
              className="form-input"
            />
          </div>

          {/* Session count — shown once all three required fields are filled */}
          {clientId && from && to && (
            <p className="invoice-session-count">
              {countLoading
                ? 'Counting sessions…'
                : sessionCount === null
                  ? ''
                  : `${sessionCount} session${sessionCount !== 1 ? 's' : ''} found`}
            </p>
          )}

          {error && <p className="form-api-error">{error}</p>}

          <div className="modal-actions">
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownload}
                disabled={!clientId || !from || !to || downloading}
              >
                {downloading ? 'Generating…' : 'Download'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default InvoiceModal;
