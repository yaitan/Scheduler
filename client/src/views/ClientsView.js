import React, { useState, useEffect } from 'react';
import NewClientModal from '../components/NewClientModal';
import EditClientModal from '../components/EditClientModal';
import '../styles/clients.css';
import { apiFetch } from '../utils/api';

function fmt(n, decimals = 1) {
  return Number(n).toFixed(decimals);
}

function BalanceCell({ value }) {
  const n = Number(value);
  if (n > 0)  return <td className="col-num balance--owed">₪{fmt(n, 0)}</td>;
  if (n < 0)  return <td className="col-num balance--credit">₪{fmt(Math.abs(n), 0)}</td>;
  return <td className="col-num balance--zero">₪0</td>;
}

function ClientsView() {
  const [clients, setClients]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editClient, setEditClient]   = useState(null);

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
        {loading ? (
          <div className="clients-empty">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="clients-empty">No clients yet. Add one to get started.</div>
        ) : (
          <table className="clients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="col-num">Balance</th>
                <th className="col-num">Rate</th>
                <th className="col-num">Hours Scheduled</th>
                <th className="col-num">Hours Completed</th>
                <th className="col-num">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.name} onClick={() => setEditClient(c)}>
                  <td>{c.name}</td>
                  <BalanceCell value={c.balance_owed} />
                  <td className="col-num">₪{fmt(c.rate, 0)}</td>
                  <td className="col-num">{fmt(c.scheduled_hours)}</td>
                  <td className="col-num">{fmt(c.total_hours)}</td>
                  <td className="col-num">₪{fmt(c.total_revenue, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddForm && (
        <NewClientModal
          onClose={() => setShowAddForm(false)}
          onAdded={() => { setShowAddForm(false); loadClients(); }}
        />
      )}

      {editClient && (
        <EditClientModal
          client={editClient}
          onClose={() => setEditClient(null)}
          onUpdated={() => { setEditClient(null); loadClients(); }}
          onDeleted={() => { setEditClient(null); loadClients(); }}
        />
      )}

    </div>
  );
}

export default ClientsView;
