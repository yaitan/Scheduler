/**
 * ConfirmDeleteModal.js
 *
 * Reusable delete-confirmation overlay used by SessionModal, PaymentModal,
 * and ClientModal. Renders a narrow modal asking the user to confirm an
 * irreversible delete action before the API call is made.
 *
 * Sub-components:
 *   ConfirmDeleteModal — the confirmation modal itself.
 */

import React from 'react';
import '../styles/clients.css';

/**
 * ConfirmDeleteModal
 *
 * A two-button (Delete / Cancel) confirmation dialog rendered as a modal overlay.
 * The caller is responsible for showing this only when confirmation is needed and
 * for hiding it (via onCancel or onClose) once the action completes or is dismissed.
 *
 * Props:
 *   title      {string}    — Modal header text (e.g. "Delete Session").
 *   message    {string}    — Primary confirmation question shown to the user.
 *   warning    {string}    — Secondary warning line. Defaults to "This cannot be undone."
 *   onConfirm  {Function}  — Called when the user clicks the Delete button.
 *   onCancel   {Function}  — Called when the user clicks Cancel (hides confirm view,
 *                            returns to the parent modal's main form).
 *   onClose    {Function}  — Called when the user clicks the X or the overlay backdrop
 *                            (closes the entire modal).
 *   submitting {boolean}   — When true, disables the Delete button and shows "Deleting…".
 *   error      {string}    — Error message shown below the warning text on API failure.
 *   zIndex     {number}    — Optional z-index for the overlay (e.g. 300 when stacked
 *                            above other modals). Omit to use the default CSS z-index.
 */
function ConfirmDeleteModal({ title, message, warning, onConfirm, onCancel, onClose, submitting, error, zIndex }) {
  const overlayStyle = zIndex != null ? { zIndex } : undefined;
  const warningText  = warning ?? 'This cannot be undone.';

  return (
    <div className="modal-overlay" style={overlayStyle} onClick={onClose}>
      {/* stopPropagation prevents the overlay click-to-close from firing inside the modal */}
      <div className="modal modal--narrow" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
          <p className="confirm-warning">{warningText}</p>
          {error && <p className="form-api-error">{error}</p>}
          <div className="modal-actions modal-actions--spread">
            <button className="btn-danger" disabled={submitting} onClick={onConfirm}>
              {submitting ? 'Deleting…' : 'Delete'}
            </button>
            <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDeleteModal;
