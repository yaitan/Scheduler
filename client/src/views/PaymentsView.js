import React, { useState, useEffect } from 'react';
import NewPaymentModal from '../components/NewPaymentModal';
import EditPaymentModal from '../components/EditPaymentModal';
import '../styles/clients.css';
import '../styles/payments.css';
import { apiFetch } from '../utils/api';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function twoMonthsAgoStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}-01`
    .replace(/^(\d{4})-00-/, (_, y) => `${Number(y) - 1}-12-`);
}

function PaymentsView() {
  const [owed, setOwed] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newPayment, setNewPayment] = useState(null);   // null | { initialClient? }
  const [editPayment, setEditPayment] = useState(null); // null | payment object

  useEffect(() => {
    setLoading(true);
    const from = twoMonthsAgoStart();
    Promise.all([
      apiFetch('/api/payments/owed').then(r => r.json()).catch(() => []),
      apiFetch(`/api/payments?from=${from}`).then(r => r.json()).catch(() => []),
    ]).then(([owedData, paymentsData]) => {
      setOwed(Array.isArray(owedData) ? owedData : []);
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
    }).finally(() => setLoading(false));
  }, [refreshKey]);

  function refresh() { setRefreshKey(k => k + 1); }

  if (loading) return null;

  return (
    <div className="payments-view">

      <div className="payments-topbar">
        <h2 className="payments-section-title">Clients</h2>
        <button className="clients-add-btn" onClick={() => setNewPayment({})}>
          + New Payment
        </button>
      </div>
      {owed.length === 0 ? (
        <div className="clients-empty">No outstanding balances.</div>
      ) : (
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Client</th>
                <th className="col-num">Balance Owed</th>
                <th className="col-num">Hours Owed</th>
                <th className="col-num">Earliest Unpaid Session</th>
              </tr>
            </thead>
            <tbody>
              {owed.map(row => (
                <tr key={row.name} onClick={() => setNewPayment({ initialClient: row.name })}>
                  <td>{row.name}</td>
                  <td className="col-num balance--owed">
                    ₪{Math.round(row.balance_owed).toLocaleString()}
                  </td>
                  <td className="col-num">{row.hours_owed % 1 === 0 ? row.hours_owed : row.hours_owed.toFixed(1)}</td>
                  <td className="payments-unpaid-date">
                    {row.earliest_unpaid ? formatDate(row.earliest_unpaid.date) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="payments-divider" />

      <h2 className="payments-section-title">Payments</h2>
      {payments.length === 0 ? (
        <div className="clients-empty">No payments in the last 2 months.</div>
      ) : (
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Date</th>
                <th className="col-num">Amount</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={i} onClick={() => setEditPayment(p)}>
                  <td>{p.name}</td>
                  <td>{formatDate(p.date)}</td>
                  <td className="col-num">₪{p.amount.toLocaleString()}</td>
                  <td className="payments-method">{p.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {newPayment !== null && (
        <NewPaymentModal
          initialClient={newPayment.initialClient}
          onClose={() => setNewPayment(null)}
          onCreated={refresh}
        />
      )}

      {editPayment && (
        <EditPaymentModal
          payment={editPayment}
          onClose={() => setEditPayment(null)}
          onUpdated={refresh}
        />
      )}

    </div>
  );
}

export default PaymentsView;
