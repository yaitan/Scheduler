/**
 * EventModal.js
 *
 * Modal dialog for creating and editing events.
 *
 * Used in two modes:
 *   - New event: opened from SessionModal's "New Event" button (new-session mode only).
 *     Date, time, and duration are optionally pre-filled from the session form fields.
 *   - Edit event: opened by clicking an event block in DayView or WeekView.
 *     Pre-populated with the event's stored data. Includes a Delete button.
 *
 * Submission flow:
 *   1. Client-side validation: name must not be blank, date is required.
 *   2. API call (POST or PUT) to persist the event.
 *
 * API routes used:
 *   POST   /api/events       — Create a new event (new mode).
 *   PUT    /api/events/:id   — Update an existing event (edit mode).
 *   DELETE /api/events/:id   — Delete an existing event (edit mode).
 *
 * Sub-components:
 *   (DurationInput is imported from DurationInput.js)
 */

import React, { useState } from 'react';
import ReactDatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';
import { toDateStr } from '../utils/dateUtils';
import LocationCombobox from './LocationCombobox';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import DurationInput from './DurationInput';
import '../styles/datepicker-theme.css';

/**
 * EventModal
 *
 * Top-level modal component for creating or editing an event.
 * Renders either a form view or a delete-confirmation view depending on state.
 *
 * Props:
 *   event           {object|null} — Existing event object when editing; null for new.
 *   initialDate     {string|null} — ISO date string (YYYY-MM-DD) to pre-fill for new events.
 *                                   Copied from SessionModal's date field.
 *   initialTime     {string|null} — HH:MM string to pre-fill for new events.
 *                                   Copied from SessionModal's time field.
 *   initialDuration {number|null} — Duration in minutes to pre-fill for new events.
 *                                   Copied from SessionModal's duration field.
 *   onClose         {Function}    — Called to close the modal without saving.
 *   onSaved         {Function}    — Called after a successful create or update.
 *   onDeleted       {Function}    — Called after a successful delete.
 *
 * States:
 *   name          {string}    — Event name. Required; must not be blank on submit.
 *   date          {Date|null} — The selected event date as a JS Date, or null if unset.
 *   time          {string}    — Event start time in HH:MM format, or '' if all-day.
 *   duration      {number}    — Event length in total minutes, or 0 if not specified.
 *   location      {string}    — Event location (optional, may be empty).
 *   error         {string}    — Hard error message shown in red below the form.
 *   submitting    {boolean}   — True while an API request is in-flight; disables buttons.
 *   confirmDelete {boolean}   — When true, renders the delete confirmation screen.
 */
function EventModal({ event, initialDate, initialTime, initialDuration, onClose, onSaved, onDeleted }) {
  const isEdit = Boolean(event);

  const [name, setName] = useState(isEdit ? event.name : '');

  // Build an initial Date object from a YYYY-MM-DD string with a local-midnight time
  // component so the date picker doesn't shift by timezone offset.
  const [date, setDate] = useState(
    isEdit      ? new Date(event.date + 'T00:00:00') :
    initialDate ? new Date(initialDate + 'T00:00:00') : null
  );

  const [time, setTime]         = useState(isEdit ? (event.time || '') : (initialTime || ''));
  const [duration, setDuration] = useState(isEdit ? (event.duration || 0) : (initialDuration || 0));
  const [location, setLocation] = useState(isEdit ? (event.location || '') : '');
  const [error, setError]       = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /**
   * POST /api/events  (new event)
   * PUT  /api/events/:id  (edit event)
   *
   * Sends the create or update request to the API.
   * Time is omitted when empty (stored as NULL = all-day event).
   * Duration is omitted when zero (stored as NULL = no set length).
   *
   * On success: calls onSaved() and onClose() to refresh the parent and close.
   * On failure: sets the error state with the server's message or a fallback.
   */
  async function doSubmit() {
    setSubmitting(true);
    setError('');
    try {
      const body = {
        name,
        date: toDateStr(date),
        location,
        // Send null explicitly to clear time/duration rather than omitting the key,
        // so PUT can distinguish "not provided" from "cleared".
        time:     time     || null,
        duration: duration || null,
      };

      const res = await apiFetch(
        isEdit ? `/api/events/${event.id}` : '/api/events',
        {
          method:  isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        }
      );
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to ${isEdit ? 'update' : 'create'} event.`);
      }
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * DELETE /api/events/:id
   *
   * Sends the delete request for the current event.
   * Only reachable after the user confirms in the delete confirmation view.
   *
   * On success (200 or 204): calls onDeleted() and onClose().
   * On failure: dismisses the confirm view and shows an error message.
   */
  async function doDelete() {
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch(`/api/events/${event.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        onDeleted();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setConfirmDelete(false);
        setError(data.error || 'Failed to delete event.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Form submission handler.
   * Validates name (required, non-blank) and date (required), then calls doSubmit().
   *
   * @param {React.FormEvent} e
   */
  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Event name is required.'); return; }
    if (!date)        { setError('Date is required.'); return; }
    doSubmit();
  }

  // ─── Delete confirmation view ────────────────────────────────────────────────
  if (confirmDelete) {
    return (
      <ConfirmDeleteModal
        title="Delete Event"
        message={`Delete "${event.name}" on ${event.date}?`}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
        onClose={onClose}
        submitting={submitting}
        error={error}
        zIndex={400}
      />
    );
  }

  // ─── Main form view ──────────────────────────────────────────────────────────
  return (
    /* z-index 400 places EventModal above SessionModal (300) when opened from it */
    <div className="modal-overlay" style={{ zIndex: 400 }} onClick={onClose}>
      {/* stopPropagation prevents the overlay click-to-close from firing when
          the user clicks inside the modal itself. */}
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{isEdit ? 'Edit Event' : 'New Event'}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>

          <div className="form-field">
            <label className="form-label">
              Name <span className="form-required">*</span>
            </label>
            <input
              type="text"
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Date picker — Saturdays receive a special CSS class for visual distinction. */}
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
            />
          </div>

          {/* Time is optional — leaving it blank makes this an all-day event */}
          <div className="form-field">
            <label className="form-label">Time</label>
            <input
              type="time"
              className="form-input"
              value={time}
              onChange={e => setTime(e.target.value)}
            />
          </div>

          {/* Duration is optional — 0:00 means no set length */}
          <div className="form-field">
            <label className="form-label">Duration</label>
            <DurationInput value={duration} onChange={setDuration} />
          </div>

          <div className="form-field">
            <label className="form-label">Location</label>
            <LocationCombobox value={location} onChange={setLocation} />
          </div>

          {error && <p className="form-api-error">{error}</p>}

          {/* Action buttons:
              - Edit mode: spread layout with Delete on the far left.
              - New mode: right-aligned Cancel + Add Event. */}
          <div className={`modal-actions${isEdit ? ' modal-actions--spread' : ''}`}>
            {isEdit && (
              <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : (isEdit ? 'Save' : 'Add Event')}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}

export default EventModal;
