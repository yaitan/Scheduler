/**
 * DurationInput.js
 *
 * Reusable HH:MM duration input field. Composed of two <input> segments
 * (hours and minutes) with full keyboard and mobile-numeric-keyboard support.
 *
 * Used by SessionModal and EventModal so that both share identical duration
 * entry behaviour.
 *
 * Exports:
 *   DurationInput — The default export; see component JSDoc below.
 */

import React, { useState, useRef } from 'react';

/**
 * DurationInput
 *
 * A custom HH:MM duration field composed of two <input> segments (hours and
 * minutes). Supports both keyboard entry (desktop) and on-screen keyboard entry
 * (mobile). inputMode="numeric" opens the numeric keypad on mobile; onKeyDown
 * handles digit/navigation logic for desktop.
 *
 * The total duration is stored and communicated as a single integer (total minutes).
 *
 * Props:
 *   value    {number}   — Current duration in total minutes.
 *   onChange {Function} — Called with the new total-minutes value whenever it changes.
 *
 * States:
 *   active {string|null} — Which segment currently has focus: 'h' (hours), 'm' (minutes),
 *                          or null when neither is focused. Controls the highlight style.
 *   buf    {string}      — Accumulation buffer for digit keypresses within the active
 *                          segment. Cleared on blur, navigation, and after two digits are
 *                          entered in the minutes segment. Allows typing "45" to mean 45
 *                          minutes rather than overwriting digit-by-digit.
 */
function DurationInput({ value, onChange }) {
  // Decompose total minutes into display hours and remainder minutes.
  const hours = Math.floor(value / 60);
  const mins  = value % 60;

  // active: which segment is focused ('h', 'm', or null)
  const [active, setActive] = useState(null);
  // buf: digit characters typed since the segment was focused, not yet committed
  const [buf, setBuf]       = useState('');

  // Refs used to programmatically move focus between segments.
  const hRef = useRef();
  const mRef = useRef();

  /** Updates the hours part while keeping minutes unchanged. Clamps to >= 0. */
  function setHours(h) { onChange(Math.max(0, h) * 60 + mins); }

  /** Updates the minutes part while keeping hours unchanged. Clamps to 0–59. */
  function setMins(m)  { onChange(hours * 60 + Math.min(59, Math.max(0, m))); }

  /**
   * Handles keydown events for both the hours ('h') and minutes ('m') segments.
   * Covers desktop keyboard navigation; mobile input is handled by handleMobileInput.
   *
   * Key behaviours:
   *   Digits      — hours: set directly then auto-advance to minutes.
   *                 minutes: buffer up to two digits, reject values > 59.
   *   ArrowUp/Down — hours: ±1. minutes: ±5 (wraps at 0/59).
   *   ArrowRight  — advance from hours to minutes segment.
   *   ArrowLeft   — retreat from minutes to hours segment.
   *   : or Tab    — advance from hours to minutes (Shift+Tab retreats).
   *   Backspace   — remove the last buffered digit, zero the segment if buffer empty.
   *
   * @param {'h'|'m'} seg - Which segment received the keydown.
   * @param {KeyboardEvent} e
   */
  function handleKey(seg, e) {
    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault();
      const n = parseInt(e.key, 10);

      if (seg === 'h') {
        // Hours: a single digit fully replaces the value, then focus jumps to minutes.
        setHours(n);
        setBuf('');
        mRef.current?.focus();
      } else {
        // Minutes: accumulate up to two digits. Reject if value would exceed 59.
        const next = buf + e.key;
        const val  = parseInt(next, 10);
        if (val > 59) return;
        setMins(val);
        if (next.length >= 2) setBuf('');   // Two digits entered — reset buffer.
        else setBuf(next);
      }

    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setBuf('');
      if (seg === 'h') setHours(hours + 1);
      else setMins((mins + 5) % 60);        // Wrap minutes around at 60.

    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); setBuf('');
      if (seg === 'h') setHours(Math.max(0, hours - 1));
      else setMins(mins < 5 ? 55 : mins - 5); // Wrap minutes down at 0.

    } else if (e.key === 'ArrowRight' && seg === 'h') {
      e.preventDefault(); setBuf(''); mRef.current?.focus();

    } else if (e.key === 'ArrowLeft' && seg === 'm') {
      e.preventDefault(); setBuf(''); hRef.current?.focus();

    } else if (e.key === ':' || (e.key === 'Tab' && !e.shiftKey && seg === 'h')) {
      // Colon or forward Tab from hours — move to minutes.
      e.preventDefault(); setBuf(''); mRef.current?.focus();

    } else if (e.key === 'Tab' && e.shiftKey && seg === 'm') {
      // Shift+Tab from minutes — move back to hours.
      e.preventDefault(); setBuf(''); hRef.current?.focus();

    } else if (e.key === 'Backspace') {
      e.preventDefault();
      const next = buf.slice(0, -1);
      setBuf(next);
      // If the buffer still has characters, parse them; otherwise zero the segment.
      if (seg === 'h') setHours(next ? parseInt(next, 10) : 0);
      else setMins(next ? parseInt(next, 10) : 0);
    }
  }

  /**
   * Handles onChange for mobile input. On desktop, handleKey calls e.preventDefault()
   * for digit keys so this never fires there. On mobile, onKeyDown fires with
   * key='Unidentified' and cannot be prevented, so onChange is the entry point.
   *
   * Extracts the last digit from the raw input value to apply the same single-digit
   * (hours) or two-digit accumulation (minutes) logic as handleKey. Taking the last
   * digit handles both mobile OS behaviours: "append" ("2" → user types 3 → "23")
   * and "replace" (selection cleared → "3").
   *
   * @param {'h'|'m'} seg - Which segment received the change.
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  function handleMobileInput(seg, e) {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      if (seg === 'h') setHours(0);
      else { setMins(0); setBuf(''); }
      return;
    }
    const newDigit = rawDigits[rawDigits.length - 1];

    if (seg === 'h') {
      setHours(parseInt(newDigit, 10));
      setBuf('');
      mRef.current?.focus();
    } else {
      const next = buf + newDigit;
      const val  = parseInt(next, 10);
      if (val > 59) return;
      setMins(val);
      if (next.length >= 2) setBuf('');
      else setBuf(next);
    }
  }

  // While a segment is active and the user has typed digits, show the raw buffer so
  // they can see what they're entering before it's committed. Otherwise show the
  // current computed value, zero-padded for minutes.
  const hDisplay = active === 'h' && buf !== '' ? buf : String(hours);
  const mDisplay = active === 'm' && buf !== '' ? buf.padStart(2, '0') : String(mins).padStart(2, '0');

  return (
    <div className="duration-input form-input">
      {/* Hours segment — opens numeric keyboard on mobile via inputMode */}
      <input
        ref={hRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className={`duration-seg${active === 'h' ? ' duration-seg--active' : ''}`}
        value={hDisplay}
        onFocus={e => { setActive('h'); setBuf(''); e.target.select(); }}
        onBlur={() => { setActive(null); setBuf(''); }}
        onKeyDown={e => handleKey('h', e)}
        onChange={e => handleMobileInput('h', e)}
      />
      <span className="duration-colon">:</span>
      {/* Minutes segment */}
      <input
        ref={mRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className={`duration-seg${active === 'm' ? ' duration-seg--active' : ''}`}
        value={mDisplay}
        onFocus={e => { setActive('m'); setBuf(''); e.target.select(); }}
        onBlur={() => { setActive(null); setBuf(''); }}
        onKeyDown={e => handleKey('m', e)}
        onChange={e => handleMobileInput('m', e)}
      />
    </div>
  );
}

export default DurationInput;
