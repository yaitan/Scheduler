/**
 * ClientModal.js
 *
 * Modal dialog for creating and editing client records.
 *
 * Used in two modes:
 *   - New client: opened from the Clients view with no `client` prop. All fields
 *     start empty.
 *   - Edit client: opened from an existing client row, pre-populated with that
 *     client's data. Includes a Delete button that leads to a confirmation step.
 *     Deleting a client also deletes all their sessions and payments (enforced
 *     server-side via cascade).
 *
 * Validation:
 *   - Name and Rate are required. Rate must be a positive whole number.
 *   - Duplicate name detection is handled server-side (409 response).
 *   - Phone fields are optional; empty strings are sent as null.
 *
 * API routes used:
 *   POST    /api/clients         — Create a new client (new-client mode).
 *   PUT     /api/clients/:id     — Update an existing client (edit mode).
 *   DELETE  /api/clients/:id     — Delete a client and all their associated data (edit mode).
 */

import React, { useState } from 'react';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';
import ConfirmDeleteModal from './ConfirmDeleteModal';

/**
 * Validates the rate field independently so the logic can be reused or tested
 * without rendering the full form.
 *
 * @param {string} rate - The raw string value from the rate input.
 * @returns {string} An error message, or an empty string if valid.
 */
function validateRateField(rate) {
  const r = Number(rate);
  if (!String(rate).trim())           return 'Rate is required.';
  if (!Number.isInteger(r) || r <= 0) return 'Rate must be a positive whole number.';
  return '';
}

/**
 * ClientModal
 *
 * Props:
 *   client     {object|null} — Existing client object when editing; null/undefined for new.
 *   onClose    {Function}    — Called to close the modal without saving.
 *   onSaved    {Function}    — Called after a successful create or update. The parent
 *                              is responsible for refreshing the client list.
 *   onDeleted  {Function}    — Called after a successful delete.
 *
 * States:
 *   form          {object}  — Controlled form values for all four fields:
 *                               name, rate, phone, parent_phone.
 *                             Rate is stored as a string to match the input value
 *                             type; it is converted to a Number before sending to the API.
 *   errors        {object}  — Per-field client-side validation error messages.
 *                             Keyed by field name (e.g. { name: 'Name is required.' }).
 *                             Cleared field-by-field as the user types.
 *   apiError      {string}  — Server-returned or network error message, shown below
 *                             the form. Covers 409 duplicate-name conflicts and generic
 *                             failures.
 *   submitting    {boolean} — True while an API request is in-flight; disables buttons.
 *   confirmDelete {boolean} — When true, renders the delete confirmation screen instead
 *                             of the main form.
 */
function ClientModal({ client, onClose, onSaved, onDeleted }) {
  const isEdit = Boolean(client);

  const [form, setForm] = useState({
    name:         client?.name         ?? '',
    rate:         client?.rate != null ? String(client.rate) : '',
    phone:        client?.phone        ?? '',
    parent_phone: client?.parent_phone ?? '',
  });
  const [errors, setErrors]         = useState({});
  const [apiError, setApiError]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /**
   * Generic field updater. Updates a single field in the form object and
   * simultaneously clears that field's validation error and any API error,
   * so stale messages disappear as soon as the user starts correcting input.
   *
   * @param {string} field - The form field key to update.
   * @param {string} value - The new value for that field.
   */
  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: '' }));
    setApiError('');
  }

  /**
   * Runs client-side validation across all required fields.
   *
   * @returns {object} Map of field name → error message for each invalid field.
   *                   An empty object means all fields are valid.
   */
  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    const rateErr = validateRateField(form.rate);
    if (rateErr) e.rate = rateErr;
    return e;
  }

  /**
   * POST /api/clients    (new client)
   * PUT  /api/clients/:id  (edit client)
   *
   * Validates the form, then sends a create or update request.
   * Phone fields are trimmed and converted to null if empty, since the API
   * stores them as nullable strings.
   *
   * On 409: shows a duplicate-name error without closing the modal.
   * On success: calls onSaved() for the parent to refresh its list.
   *
   * @param {React.FormEvent} ev - The form's submit event.
   */
  async function handleSubmit(ev) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    setSubmitting(true);
    try {
      const res = await apiFetch(
        isEdit ? `/api/clients/${client.id}` : '/api/clients',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:         form.name.trim(),
            rate:         Number(form.rate),
            phone:        form.phone.trim()        || null,
            parent_phone: form.parent_phone.trim() || null,
          }),
        }
      );

      // 409 means a client with that name already exists — surface a specific message.
      if (res.status === 409) { setApiError('A client with that name already exists.'); return; }
      if (!res.ok)            { setApiError('Something went wrong. Please try again.');  return; }

      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * DELETE /api/clients/:id
   *
   * Sends the delete request for the current client.
   * Only reachable after the user confirms in the delete confirmation view.
   * Note: server-side cascade deletes all sessions and payments for this client.
   *
   * On success (200 or 204): calls onDeleted() for the parent to refresh.
   * On failure: dismisses the confirm view and shows an error message.
   */
  async function handleDelete() {
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        onDeleted();
      } else {
        const data = await res.json().catch(() => ({}));
        setConfirmDelete(false);
        setApiError(data.error || 'Failed to delete client.');
      }
    } catch {
      setApiError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Delete confirmation view ────────────────────────────────────────────────
  // Shown instead of the main form when the user clicks the Delete button.
  // Warns that sessions and payments will also be deleted.
  if (confirmDelete) {
    return (
      <ConfirmDeleteModal
        title="Delete Client"
        message={`Delete ${client.name}?`}
        warning="This will also delete all their sessions and payments. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        onClose={onClose}
        submitting={submitting}
        error={apiError}
      />
    );
  }

  // ─── Main form view ──────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? 'Edit Client' : 'Add Client'}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* noValidate disables native browser validation so our custom error
            messages are shown instead. */}
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

          {/* Phone fields are optional — empty values are sent as null to the API */}
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
                {submitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save' : 'Add Client')}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}

export default ClientModal;
