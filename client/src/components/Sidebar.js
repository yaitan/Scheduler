/**
 * Sidebar.js
 *
 * Slide-in navigation sidebar used on all views.
 *
 * The sidebar is always mounted in the DOM but slides in/out via CSS (controlled
 * by the `sidebar--open` modifier class). When open, a full-screen overlay is
 * rendered behind it so the user can close the sidebar by clicking outside.
 *
 * Navigation items are defined in the NAV_ITEMS constant below. Adding a new
 * top-level view requires only a new entry there — no JSX changes needed.
 */

import React from 'react';
import '../styles/sidebar.css';

/**
 * Ordered list of top-level navigation destinations.
 * Each entry maps to a view ID recognised by the parent App component.
 */
const NAV_ITEMS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'clients',  label: 'Clients'  },
  { id: 'payments', label: 'Payments' },
];

/**
 * Sidebar
 *
 * Renders the navigation drawer and its backdrop overlay.
 *
 * Props:
 *   activeView  {string}   — ID of the currently active view. The matching nav
 *                            item receives the `sidebar-nav-item--active` style.
 *   onNavigate  {Function} — Called with a view ID string when the user selects
 *                            a nav item. The parent is responsible for switching views.
 *   isOpen      {boolean}  — When true, the sidebar slides into view and the
 *                            overlay is rendered.
 *   onClose     {Function} — Called when the user clicks the close button or the
 *                            backdrop overlay, signalling the parent to set isOpen=false.
 */
function Sidebar({ activeView, onNavigate, isOpen, onClose }) {
  return (
    <>
      {/* Backdrop overlay — only rendered when the sidebar is open. Clicking it
          closes the sidebar without navigating anywhere. */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}

      <nav className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Scheduler</span>
          <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>

        <ul className="sidebar-nav">
          {NAV_ITEMS.map(({ id, label }) => (
            <li key={id}>
              {/* Navigate then immediately close the sidebar so the drawer
                  doesn't stay open after the user picks a destination. */}
              <button
                className={`sidebar-nav-item ${activeView === id ? 'sidebar-nav-item--active' : ''}`}
                onClick={() => { onNavigate(id); onClose(); }}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

export default Sidebar;
