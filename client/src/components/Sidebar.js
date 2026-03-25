import React from 'react';
import '../styles/sidebar.css';

const NAV_ITEMS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'clients', label: 'Clients' },
  { id: 'payments', label: 'Payments' },
];

function Sidebar({ activeView, onNavigate, isOpen, onClose }) {
  return (
    <>
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
