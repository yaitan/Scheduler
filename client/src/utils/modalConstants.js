/**
 * modalConstants.js
 *
 * Shared UI constants used across the modal components.
 *
 * Exports:
 *   LOCATION_OPTIONS   {string[]}  — Preset location suggestions shown in the
 *                                    location datalist on ClientModal and SessionModal.
 *                                    Free text entry is always allowed in addition to
 *                                    these presets.
 *   PAYMENT_METHODS    {string[]}  — Allowed payment methods shown in the Method
 *                                    dropdown on PaymentModal. Must stay in sync with
 *                                    the CHECK constraint in server/routes/payments.js.
 */

export const LOCATION_OPTIONS = ['Zoom', 'Home', "Client"];

export const PAYMENT_METHODS = ['PayBox', 'Bit', 'Transfer', 'Cash', 'Other'];
