/**
 * LoginScreen.js
 *
 * Full-screen password prompt shown when the user is not authenticated.
 *
 * The app uses a single shared password (no per-user accounts). On success the
 * server returns a JWT which is stored via `setToken` and attached to all
 * subsequent API requests by the `apiFetch` utility.
 *
 * API routes used:
 *   POST  /api/auth/verify  — Validates the password and returns a JWT on success.
 *                             Note: uses raw `fetch` instead of `apiFetch` because
 *                             no auth token exists yet at login time.
 */

import React, { useState } from 'react';
import { setToken } from '../utils/api';
import '../styles/login.css';

/**
 * LoginScreen
 *
 * Renders a centered card with a password field. Replaces the entire app UI
 * until authentication succeeds.
 *
 * Props:
 *   onLogin  {Function} — Called with no arguments after a successful login.
 *                         The parent App component uses this to unmount
 *                         LoginScreen and render the main application.
 *
 * States:
 *   password  {string}  — Current value of the password input field.
 *                         Cleared on a failed attempt to avoid re-submitting
 *                         a wrong password accidentally.
 *   error     {string}  — Error message shown below the input. Set on wrong
 *                         password or network failure; cleared on each new attempt.
 *   loading   {boolean} — True while the POST /api/auth/verify request is
 *                         in-flight. Disables the submit button to prevent
 *                         duplicate requests.
 */
function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  /**
   * POST /api/auth/verify
   *
   * Submits the password to the server for verification.
   *
   * On success: stores the returned JWT via setToken(), then calls onLogin()
   *             to hand control back to the parent.
   * On wrong password (non-ok response): shows an error and clears the field
   *             so the user starts fresh.
   * On network failure: shows a connection error message.
   *
   * @param {React.FormEvent} e - The form's submit event.
   */
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const { token } = await res.json();
        // Persist the token so apiFetch attaches it to all future requests.
        setToken(token);
        onLogin();
      } else {
        setError('Incorrect password.');
        setPassword(''); // Clear the field so the user doesn't accidentally re-submit.
      }
    } catch {
      setError('Could not connect to server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-card">
        <h1 className="login-title">Tutoring Scheduler</h1>
        <form className="login-form" onSubmit={handleSubmit}>
          <input
            className="login-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          {error && <p className="login-error">{error}</p>}
          {/* Button is disabled while loading or if the field is empty,
              preventing submission of a blank password. */}
          <button className="login-btn" type="submit" disabled={loading || !password}>
            {loading ? 'Verifying…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginScreen;
