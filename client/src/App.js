import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import CalendarView from './views/CalendarView';
import ClientsView from './views/ClientsView';
import PaymentsView from './views/PaymentsView';
import LoginScreen from './components/LoginScreen';
import { getToken, clearToken } from './utils/api';
import './styles/global.css';

const VIEWS = {
  calendar: CalendarView,
  clients: ClientsView,
  payments: PaymentsView,
};

function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [activeView, setActiveView] = useState('calendar');
  const [calendarKey, setCalendarKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function goToCurrentMonth() {
    setActiveView('calendar');
    setCalendarKey(k => k + 1);
  }

  useEffect(() => {
    function handleLogout() {
      clearToken();
      setAuthed(false);
    }
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

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
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>
          <h1 className="app-header-title" onClick={goToCurrentMonth} style={{ cursor: 'pointer' }}>Tutoring Scheduler</h1>
        </header>
        <main className="app-main">
          {activeView === 'calendar'
            ? <CalendarView key={calendarKey} onNavigate={setActiveView} />
            : <ActiveView />}
        </main>
      </div>
    </div>
  );
}

export default App;
