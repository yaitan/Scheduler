/**
 * api.js
 *
 * Authentication token management and the authenticated fetch wrapper used by
 * all API calls in the app.
 *
 * The app uses a single JWT stored in localStorage. After a successful login
 * (LoginScreen → POST /api/auth/verify), the token is saved with setToken().
 * Every subsequent API call goes through apiFetch(), which attaches the token
 * as a Bearer Authorization header automatically.
 *
 * If the server returns 401 (token missing, expired, or invalid), apiFetch()
 * clears the stored token and fires the 'auth:logout' window event. The root
 * App component listens for this event and returns the user to the login screen.
 *
 * Exports:
 *   getToken()           — Read the stored JWT from localStorage.
 *   setToken(token)      — Persist a JWT to localStorage after login.
 *   clearToken()         — Remove the JWT from localStorage (logout / 401).
 *   apiFetch(url, opts)  — Authenticated fetch wrapper; attaches Bearer token
 *                          and handles 401 auto-logout.
 */

/**
 * Retrieves the stored JWT from localStorage.
 *
 * @returns {string|null} The token string, or null if not logged in.
 */
export function getToken() {
  return localStorage.getItem('auth_token');
}

/**
 * Persists a JWT to localStorage after a successful login.
 *
 * @param {string} token - The JWT returned by POST /api/auth/verify.
 */
export function setToken(token) {
  localStorage.setItem('auth_token', token);
}

/**
 * Removes the JWT from localStorage.
 * Called on logout and automatically by apiFetch() on a 401 response.
 */
export function clearToken() {
  localStorage.removeItem('auth_token');
}

/**
 * Authenticated wrapper around the native fetch API.
 * Injects the stored JWT as a Bearer Authorization header on every request.
 *
 * On a 401 response: clears the token and dispatches the 'auth:logout' event
 * so the App component can redirect to the login screen. The raw response is
 * still returned so callers can inspect it if needed.
 *
 * All API calls in the app should use this function instead of fetch() directly,
 * except for POST /api/auth/verify (where no token exists yet).
 *
 * @param {string}  url     - The API endpoint path (e.g. '/api/sessions').
 * @param {object}  options - Standard fetch options (method, headers, body, etc.).
 *                            Any headers provided here are merged with the auth header.
 * @returns {Promise<Response>} The raw fetch Response object.
 */
export async function apiFetch(url, options = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      // Only inject the Authorization header if a token is available.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 401) {
    // Token is invalid or expired — clear it and signal the app to log out.
    clearToken();
    window.dispatchEvent(new Event('auth:logout'));
  }

  return res;
}
