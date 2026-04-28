/**
 * LocationCombobox.js
 *
 * A combobox input for the session/client location field. Opens a dropdown
 * of all preset suggestions on focus (before any typing). Free text entry is
 * always allowed — the dropdown is a convenience shortcut, not a constraint.
 *
 * The dropdown closes when the input loses focus (150 ms delay so an option
 * click registers before the blur fires) or when an option is selected.
 *
 * Exports:
 *   LocationCombobox — the combobox component.
 */

import React, { useState } from 'react';
import { LOCATION_OPTIONS } from '../utils/modalConstants';

/**
 * LocationCombobox
 *
 * Props:
 *   value     {string}   — Current text value of the input (controlled).
 *   onChange  {Function} — Called with the new string value on every change.
 */
function LocationCombobox({ value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="combobox-wrapper">
      <input
        className="form-input"
        value={value}
        autoComplete="off"
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        // Delay lets the onMouseDown on a list item fire before blur hides the list.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className="combobox-dropdown">
          {LOCATION_OPTIONS.map(opt => (
            <li
              key={opt}
              className="combobox-option"
              onMouseDown={() => { onChange(opt); setOpen(false); }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocationCombobox;
