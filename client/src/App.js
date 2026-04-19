/**
 * App.js
 *
 * Root application component. Manages authentication state, top-level navigation,
 * and the persistent layout (header + sidebar).
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
 *     requires only a new entry there and a matching Sidebar NAV_ITEMS entry.
 *   - CalendarView is special: it receives a `key` prop (`calendarKey`) that
 *     increments when the user clicks the header title, forcing the component
 *     to remount and reset to the current month.
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import CalendarView from './views/CalendarView';
import ClientsView from './views/ClientsView';
import PaymentsView from './views/PaymentsView';
import LoginScreen from './components/LoginScreen';
import { getToken, clearToken } from './utils/api';
import './styles/global.css';

/**
 * Maps view ID strings (used by Sidebar and onNavigate callbacks) to their
 * corresponding view components. CalendarView is rendered separately to support
 * the `key`-based remount pattern — see the render section below.
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
 *   calendarKey  {number}  — Incremented when the user clicks the header title.
 *                            Passed as `key` to CalendarView to force a full remount,
 *                            which resets it to the current month.
 *   sidebarOpen  {boolean} — Controls whether the Sidebar drawer is visible.
 *                            Opened by the hamburger button; closed by Sidebar itself
 *                            after navigation or by clicking the overlay.
 */
function App() {
  // Lazy initialiser reads localStorage once at mount rather than on every render.
  const [authed, setAuthed]           = useState(() => !!getToken());
  const [activeView, setActiveView]   = useState('calendar');
  const [calendarKey, setCalendarKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /**
   * Navigates to the calendar and forces it to remount (resetting to the current
   * month). Triggered by clicking the app title in the header.
   */
  function goToCurrentMonth() {
    setActiveView('calendar');
    setCalendarKey(k => k + 1);
  }

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
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="app-layout">
        <header className="app-header">
          {/* Three-bar hamburger button opens the sidebar drawer */}
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
          {/* Clicking the title navigates to the calendar and resets it to today's month */}
          <h1 className="app-header-title" onClick={goToCurrentMonth} style={{ cursor: 'pointer' }}>
            Tutoring Scheduler
          </h1>
        </header>
        <main className="app-main">
          {/* CalendarView gets a key so it fully remounts when the title is clicked.
              All other views are rendered generically via the VIEWS lookup. */}
          {activeView === 'calendar'
            ? <CalendarView key={calendarKey} onNavigate={setActiveView} />
            : <ActiveView />}
        </main>
      </div>
    </div>
  );
}

export default App;
