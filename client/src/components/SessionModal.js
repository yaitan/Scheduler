/**
 * SessionModal.js
 *
 * Modal dialog for creating and editing therapy sessions.
 *
 * Used in two modes:
 *   - New session: opened from CalendarView/DayView with an optional pre-filled
 *     date and time. The client dropdown auto-fills the rate and location from the
 *     client record. Includes a "New Event" button that opens EventModal pre-filled
 *     with the current date/time/duration, allowing an event to be created without
 *     closing the session form.
 *   - Edit session: opened from an existing session card, pre-populated with that
 *     session's data. Includes a Delete button that leads to a confirmation step.
 *
 * Submission flow:
 *   1. Client-side validation (required fields, minimum duration).
 *   2. Soft-warning check (past date, unusual hour) — user can proceed past warnings.
 *   3. API call (POST or PUT) to persist the session.
 *
 * API routes used:
 *   GET    /api/clients              — Fetch all clients to populate the dropdown.
 *   POST   /api/sessions             — Create a new session (new-session mode).
 *   PUT    /api/sessions/:id         — Update an existing session (edit mode).
 *   DELETE /api/sessions/:id         — Delete an existing session (edit mode).
 *
 * Sub-components:
 *   (DurationInput is imported from DurationInput.js)
 */

import React, { useState, useEffect } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';
import { nowInIsrael, toDateStr } from '../utils/dateUtils';
import LocationCombobox from './LocationCombobox';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import DurationInput from './DurationInput';
import '../styles/datepicker-theme.css';

/**
 * SessionModal
 *
 * Top-level modal component for creating or editing a session.
 * Renders either a form view or a delete-confirmation view depending on state.
 *
 * Props:
 *   session      {object|null} - Existing session object when editing; null for new.
 *   initialDate  {string|null} - ISO date string (YYYY-MM-DD) to pre-fill for new sessions.
 *   initialTime  {string|null} - HH:MM string to pre-fill for new sessions.
 *   onClose      {Function}    - Called to close the modal without saving.
 *   onSaved      {Function}    - Called after a successful create or update.
 *   onDeleted    {Function}    - Called after a successful delete.
 *
 * States:
 *   clients       {Array}        - List of all clients fetched from GET /api/clients on mount,
 *                                  used to populate the client dropdown and auto-fill rate.
 *   clientId      {string}       - The selected client's ID as a string (matches <select> value).
 *   date          {Date|null}    - The selected session date as a JS Date, or null if unset.
 *   time          {string}       - Session start time in HH:MM format.
 *   duration      {number}       - Session length in total minutes.
 *   rate          {string}       - Hourly rate as a string (kept as string to match input value).
 *   location      {string}       - Session location. Pre-filled from the selected client's location
 *                                  when creating a new session; shows the session's stored location
 *                                  when editing.
 *   error         {string}       - Hard error message shown in red below the form.
 *   submitting    {boolean}      - True while an API request is in-flight; disables buttons.
 *   warnings      {string[]|null}- Non-blocking warnings (e.g. past date, late hour). When set,
 *                                  the form switches to a "proceed anyway / go back" confirmation
 *                                  state before the API call is made. Null means no warnings.
 *   confirmDelete  {boolean}      - When true, renders the delete confirmation screen instead
 *                                   of the main form.
 */
function SessionModal({ session, initialDate, initialTime, onClose, onSaved, onDeleted, onEventCreated, onOpenNewEvent }) {
  // Determine mode: editing an existing session vs. creating a new one.
  const isEdit = Boolean(session);

  const [clients, setClients]   = useState([]);
  const [clientId, setClientId] = useState(isEdit ? String(session.client_id) : '');

  // Build an initial Date object from a YYYY-MM-DD string with a local-midnight time
  // component so the date picker doesn't shift by timezone offset.
  const [date, setDate] = useState(
    isEdit        ? new Date(session.date + 'T00:00:00') :
    initialDate   ? new Date(initialDate  + 'T00:00:00') : null
  );

  const [time, setTime]         = useState(isEdit ? session.time : (initialTime || ''));
  const [duration, setDuration] = useState(isEdit ? session.duration : 60);
  const [rate, setRate]         = useState(isEdit ? String(session.rate) : '');
  const [location, setLocation] = useState(isEdit ? (session.location ?? '') : '');
  const [error, setError]       = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [warnings, setWarnings]           = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /**
   * GET /api/clients
   * Fetches the full client list on mount so the dropdown is populated and rate
   * auto-fill works even when opening the modal for a new session.
   */
  useEffect(() => {
    apiFetch('/api/clients')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setClients(data); })
      .catch(() => {});
  }, []);

  /**
   * Handles client dropdown changes. When a client is selected, automatically
   * sets the rate field to that client's default rate so the user doesn't need
   * to re-enter it for recurring sessions.
   */
  function handleClientChange(e) {
    const id = e.target.value;
    setClientId(id);
    const client = clients.find(c => c.id === parseInt(id));
    setRate(client ? String(client.rate) : '');
    setLocation(client ? (client.location ?? '') : '');
  }

  /**
   * Computes soft-warning messages that don't block submission but prompt the
   * user to confirm before proceeding.
   *
   * Current warnings:
   *   - Date is before today (scheduling in the past). In edit mode this warning
   *     is suppressed when neither the date nor the time was changed, since the
   *     session was already saved in the past intentionally.
   *   - Time is between 11pm and 7am (unusual working hours).
   *
   * @returns {string[]} Array of warning message strings (empty if none).
   */
  function buildWarnings() {
    const w = [];

    if (date) {
      // Compare calendar dates only — strip the time component before comparing.
      const today = nowInIsrael();
      today.setHours(0, 0, 0, 0);
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      if (d < today) {
        // Skip the warning in edit mode when neither date nor time was touched.
        const dateChanged = !isEdit || toDateStr(date) !== session.date;
        const timeChanged = !isEdit || time !== session.time;
        if (dateChanged || timeChanged) w.push('The selected date is in the past.');
      }
    }

    if (time) {
      const h = Number(time.split(':')[0]);
      if (h >= 23 || h < 7) w.push('The selected time is between 11pm and 7am.');
    }

    return w;
  }

  /**
   * POST /api/sessions  (new session)
   * PUT  /api/sessions/:id  (edit session)
   *
   * Sends the create or update request to the API.
   * Called either directly from handleSubmit (no warnings) or from the
   * "Proceed anyway" button (user acknowledged warnings).
   *
   * On success: calls onSaved() and onClose() to refresh the parent and close.
   * On failure: sets the error state with the server's error message or a fallback.
   */
  async function doSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(
        isEdit ? `/api/sessions/${session.id}` : '/api/sessions',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: parseInt(clientId),
            date:      toDateStr(date),
            time,
            duration,
            rate:      parseFloat(rate),
            location,
          }),
        }
      );
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setWarnings(null);
        setError(data.error || `Failed to ${isEdit ? 'update' : 'create'} session.`);
      }
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * DELETE /api/sessions/:id
   *
   * Sends the delete request for the current session.
   * Only reachable after the user confirms in the delete confirmation view.
   *
   * On success (200 or 204): calls onDeleted() and onClose().
   * On failure: dismisses the confirm view and shows an error message.
   */
  async function doDelete() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(`/api/sessions/${session.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        onDeleted();
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

  /**
   * Form submission handler. Runs validation in this order:
   *   1. Hard validation: required date, minimum duration (30 min).
   *   2. Soft warnings: past date, unusual hour. If any warnings exist, the form
   *      pauses and shows them — the user must choose "Proceed anyway" or "Go back".
   *   3. If validation passes with no warnings, calls doSubmit() directly.
   *
   * @param {React.FormEvent} e - The form's submit event.
   */
  function handleSubmit(e) {
    e.preventDefault();
    if (!date) { setError('Date is required.'); return; }
    if (duration < 30) { setError('Duration must be at least 30 minutes.'); return; }

    const w = buildWarnings();
    if (w.length > 0) { setWarnings(w); return; } // Pause for user confirmation.

    doSubmit();
  }

  // ─── Delete confirmation view ────────────────────────────────────────────────
  // Shown instead of the main form when the user clicks the Delete button.
  // Requires an explicit second click to confirm the irreversible action.
  if (confirmDelete) {
    return (
      <ConfirmDeleteModal
        title="Delete Session"
        message={`Delete ${session.name}'s session on ${session.date} at ${session.time}?`}
        onConfirm={doDelete}
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
          <span className="modal-title">{isEdit ? 'Edit Session' : 'New Session'}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>

          {/* Client dropdown — also triggers rate auto-fill via handleClientChange */}
          <div className="form-field">
            <label className="form-label">
              Client <span className="form-required">*</span>
            </label>
            <select
              className="form-input"
              value={clientId}
              onChange={handleClientChange}
              required
            >
              <option value="" />
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Date picker — Saturdays receive a special CSS class for visual distinction.
              Clearing warnings on change prevents stale warnings after a date edit. */}
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

          {/* Native time input — warnings are cleared on change for the same reason as date */}
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
              Duration <span className="form-required">*</span>
            </label>
            <DurationInput value={duration} onChange={setDuration} />
          </div>
          
          <div className="form-field">
            <label className="form-label">Location</label>
            <LocationCombobox value={location} onChange={setLocation} />
          </div>

          <div className="form-field">
            <label className="form-label">
              Rate <span className="form-required">*</span>
            </label>
            <input
              type="number"
              className="form-input"
              value={rate}
              onChange={e => setRate(e.target.value)}
              min="0"
              step="1"
              required
            />
          </div>

          {/* Warning box — visible only when buildWarnings() returned messages.
              Replaces the normal action buttons with "Go back / Proceed anyway". */}
          {warnings && (
            <div className="form-warning-box">
              {warnings.map((w, i) => (
                <p key={i} className="form-warning-text">{w}</p>
              ))}
            </div>
          )}

          {error && <p className="form-api-error">{error}</p>}

          {/* Action buttons — layout depends on mode:
              - Edit mode: spread layout so Delete sits on the far left.
              - New mode: spread layout so "New Event" sits on the far left.
              - Warning state: "Go back" + "Proceed anyway" replace the normal buttons.
              - Normal state: "Cancel" + primary action button. */}
          <div className="modal-actions modal-actions--spread">
            {isEdit ? (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            ) : (
              /* "New Event" closes SessionModal and tells the parent to open EventModal
                 pre-filled with the current form values. Both run in the same React
                 batch so the transition is instantaneous. */
              <button type="button" className="btn-secondary" onClick={() => {
                onClose();
                onOpenNewEvent?.({
                  date:     date ? toDateStr(date) : undefined,
                  time:     time || undefined,
                  duration: duration > 0 ? duration : undefined,
                });
              }}>
                New Event
              </button>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
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
                    {submitting ? 'Saving…' : (isEdit ? 'Save' : 'Schedule')}
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

export default SessionModal;
