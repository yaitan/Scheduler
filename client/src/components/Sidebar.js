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
 *
 * API routes used:
 *   GET  /api/backup  — Streams the SQLite database file as a binary download.
 */

import React, { useState } from 'react';
import { apiFetch } from '../utils/api';
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
 *
 * States:
 *   downloading  {boolean} — True while the GET /api/backup request is in-flight.
 *                            Disables the button to prevent duplicate downloads.
 */
function Sidebar({ activeView, onNavigate, isOpen, onClose }) {
  const [downloading, setDownloading] = useState(false);

  /**
   * downloadBackup
   *
   * GET /api/backup
   *
   * Fetches the SQLite database file and triggers a browser file download.
   * Creates a temporary object URL from the response blob, clicks a synthetic
   * <a> element to trigger the Save dialog, then immediately revokes the URL
   * to free memory.
   */
  async function downloadBackup() {
    setDownloading(true);
    try {
      const res = await apiFetch('/api/backup');
      if (!res.ok) {
        alert('Backup failed — check the server logs.');
        return;
      }

      const blob        = await res.blob();
      const url         = URL.createObjectURL(blob);
      const a           = document.createElement('a');

      // Pull the server-provided filename from the Content-Disposition header
      // (e.g. "scheduler-backup-2026-04-19.db") so the downloaded file is
      // date-stamped without the client needing to know today's date.
      const disposition = res.headers.get('Content-Disposition') || '';
      const match       = disposition.match(/filename="([^"]+)"/);
      a.download        = match ? match[1] : 'scheduler-backup.db';

      a.href = url;
      // The element must be in the DOM for Firefox to fire the download.
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Backup failed — network error.');
    } finally {
      setDownloading(false);
    }
  }

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

        {/* Footer — pushed to the bottom of the flex column via margin-top: auto */}
        <div className="sidebar-footer">
          <button
            className="sidebar-backup-btn"
            onClick={downloadBackup}
            disabled={downloading}
          >
            {downloading ? 'Downloading…' : 'Download Backup'}
          </button>
        </div>
      </nav>
    </>
  );
}

export default Sidebar;
