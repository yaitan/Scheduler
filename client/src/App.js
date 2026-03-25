import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import CalendarView from './views/CalendarView';
import ClientsView from './views/ClientsView';
import PaymentsView from './views/PaymentsView';
import './styles/global.css';

const VIEWS = {
  calendar: CalendarView,
  clients: ClientsView,
  payments: PaymentsView,
};

function App() {
  const [activeView, setActiveView] = useState('calendar');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          <h1 className="app-header-title">Tutoring Scheduler</h1>
        </header>
        <main className="app-main">
          <ActiveView />
        </main>
      </div>
    </div>
  );
}

export default App;
