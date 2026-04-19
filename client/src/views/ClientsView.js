/**
 * ClientsView.js
 *
 * Top-level view displaying all clients and their aggregate stats.
 *
 * Renders a single table with one row per client showing their balance,
 * rate, total scheduled time, total completed time, and total revenue.
 * Clicking a row opens ClientModal in edit mode. The "+ Add Client" button
 * opens ClientModal in new-client mode.
 *
 * The client list is fetched on mount and re-fetched after every save or
 * delete via the `loadClients` function (passed as a callback to the modal).
 *
 * API routes used:
 *   GET  /api/clients  — Fetch all clients with their computed aggregate stats.
 *
 * Sub-components:
 *   BalanceCell — Renders a table cell with colour-coded balance styling.
 */

import React, { useState, useEffect } from 'react';
import ClientModal from '../components/ClientModal';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';
import { fmtDuration } from '../utils/dateUtils';

/**
 * BalanceCell
 *
 * Renders a `<td>` for a client's balance_owed value with context-sensitive
 * colour coding:
 *   - Positive (money owed to tutor): red  (`balance--owed`)
 *   - Negative (credit / overpayment): green (`balance--credit`)
 *   - Zero: neutral (`balance--zero`)
 *
 * @param {number|string} value - The balance_owed value from the API.
 */
function BalanceCell({ value }) {
  const n = Number(value);
  if (n > 0) return <td className="col-num balance--owed">₪{Math.round(n).toLocaleString()}</td>;
  if (n < 0) return <td className="col-num balance--credit">₪{Math.round(Math.abs(n)).toLocaleString()}</td>;
  return <td className="col-num balance--zero">₪0</td>;
}

/**
 * ClientsView
 *
 * States:
 *   clients      {Array}   — All client records from GET /api/clients, each including
 *                            computed fields: balance_owed, scheduled_minutes,
 *                            total_minutes, total_revenue.
 *   loading      {boolean} — True while the initial fetch is in-flight. The table
 *                            is hidden until loading is false to avoid an empty flash.
 *   showAddForm  {boolean} — When true, ClientModal is rendered in new-client mode.
 *   editClient   {object|null} — When non-null, ClientModal is rendered in edit mode
 *                            with this client object.
 */
function ClientsView() {
  const [clients, setClients]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editClient, setEditClient]   = useState(null);

  /**
   * GET /api/clients
   *
   * Fetches the full client list and updates state. Called on mount and
   * passed as a callback to ClientModal so the list refreshes after any
   * create, update, or delete without a full page reload.
   */
  function loadClients() {
    apiFetch('/api/clients')
      .then(r => r.json())
      .then(data => { setClients(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(loadClients, []);

  return (
    <div className="clients-view">

      <div className="clients-topbar">
        <h2 className="clients-title">Clients</h2>
        <button className="clients-add-btn" onClick={() => setShowAddForm(true)}>
          + Add Client
        </button>
      </div>

      <div className="clients-table-wrap">
        {/* Table is only rendered after loading completes to avoid a jarring
            empty-state flash on initial page load. */}
        {!loading && (clients.length === 0 ? (
          <div className="clients-empty">No clients yet. Add one to get started.</div>
        ) : (
          <table className="clients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="col-num">Balance</th>
                <th className="col-num">Rate</th>
                <th className="col-num">Scheduled</th>
                <th className="col-num">Completed</th>
                <th className="col-num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} onClick={() => setEditClient(c)}>
                  <td>{c.name}</td>
                  <BalanceCell value={c.balance_owed} />
                  <td className="col-num">₪{c.rate.toLocaleString()}</td>
                  <td className="col-num">{fmtDuration(c.scheduled_minutes)}</td>
                  <td className="col-num">{fmtDuration(c.total_minutes)}</td>
                  <td className="col-num">₪{Math.round(c.total_revenue).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>

      {/* New client modal */}
      {showAddForm && (
        <ClientModal
          onClose={() => setShowAddForm(false)}
          onSaved={() => { setShowAddForm(false); loadClients(); }}
        />
      )}

      {/* Edit client modal */}
      {editClient && (
        <ClientModal
          client={editClient}
          onClose={() => setEditClient(null)}
          onSaved={() => { setEditClient(null); loadClients(); }}
          onDeleted={() => { setEditClient(null); loadClients(); }}
        />
      )}

    </div>
  );
}

export default ClientsView;
