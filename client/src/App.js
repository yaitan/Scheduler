/**
 * App.js
 *
 * Root application component. Manages authentication state, top-level navigation,
 * and the persistent layout (topbar + main content).
 *
 * Auth flow:
 *   - On mount, checks localStorage for a stored JWT via getToken(). If found,
 *     the user is considered authenticated and the main app renders immediately
 *     (no server round-trip needed — the server validates on each API call).
 *   - If no token exists, LoginScreen is rendered instead of the main app.
 *   - When any API call returns 401, apiFetch() fires the 'auth:logout' window
 *     event. App listens for this event and clears the token + resets authed to
 *     false, returning the user to LoginScreen.
 *
 * Navigation:
 *   - The active view is controlled by the `activeView` string state.
 *   - Views are resolved via the VIEWS lookup — adding a new top-level view
 *     requires only a new entry there and a matching NAV_ITEMS entry.
 *   - CalendarView receives an `onNavigate` callback so it can switch to other
 *     views (e.g. jumping to the Clients view from a session).
 */

import React, { useState, useEffect } from 'react';
import CalendarView from './views/CalendarView';
import ClientsView from './views/ClientsView';
import PaymentsView from './views/PaymentsView';
import LoginScreen from './components/LoginScreen';
import { getToken, clearToken } from './utils/api';
import './styles/global.css';

/** Nav items rendered in the topbar. Order here controls display order. */
const NAV_ITEMS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'clients',  label: 'Clients'  },
  { id: 'payments', label: 'Payments' },
];

/**
 * Maps view ID strings to their corresponding view components. CalendarView is
 * rendered separately to support the `key`-based remount pattern — see below.
 */
const VIEWS = {
  calendar: CalendarView,
  clients:  ClientsView,
  payments: PaymentsView,
};

/**
 * App
 *
 * States:
 *   authed       {boolean} — Whether the user is authenticated. Initialised lazily
 *                            from localStorage (true if a JWT is present). Set to
 *                            false on logout or 401 response.
 *   activeView   {string}  — ID of the currently displayed view ('calendar',
 *                            'clients', or 'payments').
 */
function App() {
  // Lazy initialiser reads localStorage once at mount rather than on every render.
  const [authed, setAuthed]         = useState(() => !!getToken());
  const [activeView, setActiveView] = useState('calendar');

  /**
   * Listens for the 'auth:logout' window event dispatched by apiFetch() on 401.
   * Clears the stored token and returns the user to LoginScreen.
   * The listener is cleaned up on unmount to prevent memory leaks.
   */
  useEffect(() => {
    function handleLogout() {
      clearToken();
      setAuthed(false);
    }
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  // ─── Unauthenticated: show login screen ──────────────────────────────────────
  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  // ─── Authenticated: main app layout ──────────────────────────────────────────
  // VIEWS[activeView] resolves the component for non-calendar views.
  const ActiveView = VIEWS[activeView];

  return (
    <div className="app">
      <div className="app-layout">
        <header className="app-header">
          <nav className="topbar-nav">
            {NAV_ITEMS.map(({ id, label }) => (
              <button
                key={id}
                className={`topbar-nav-item${activeView === id ? ' topbar-nav-item--active' : ''}`}
                onClick={() => setActiveView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </header>
        <main className="app-main">
          <ActiveView onNavigate={setActiveView} />
        </main>
      </div>
    </div>
  );
}

export default App;
