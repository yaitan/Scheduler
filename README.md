# Tutoring Scheduler

A personal web app for managing a tutoring business — track sessions, clients, and payments.

## Features

- **Calendar views** — monthly, weekly, and daily session views
- **Session management** — schedule, edit, and track sessions with Scheduled / Completed / Cancelled status; sessions auto-complete after their end time
- **Client management** — store client details (rate, phone, parent phone) and view stats (hours, revenue, balance owed)
- **Payments** — log payments by method (PayBox, Bit, Transfer, Cash, Other) with automatic balance calculation
- **Yearly summary** — revenue and hours broken down by month
- **Israeli holidays** — Shabbat and national holidays shown on the calendar
- **Overlap detection** — prevents scheduling conflicting sessions

## Tech Stack

**Frontend:** React 18, Create React App, react-datepicker  
**Backend:** Node.js, Express, SQLite (file-based via `node:sqlite`)  
**Auth:** Single-password login protected by JWT

## Project Structure

```
├── client/          # React frontend
│   └── src/
│       ├── components/   # Modals and shared UI
│       ├── views/        # CalendarView, ClientsView, PaymentsView, WeekView, DayView
│       ├── styles/       # CSS per view/component
│       └── utils/        # API wrapper, date utilities, holiday data
└── server/          # Express backend
    ├── routes/       # auth, clients, sessions, payments
    ├── middleware/   # JWT auth guard
    └── db/           # SQLite setup and schema
```

## Getting Started

### Prerequisites

- Node.js 18+

### Install dependencies

```bash
npm install
cd client && npm install
cd ../server && npm install
```

### Environment variables

Create `server/.env`:

```
APP_PASSWORD=your_password
JWT_SECRET=your_secret
PORT=3001
DB_PATH=./db/scheduler.db   # optional, defaults to server/scheduler.db
```

### Run in development

```bash
npm run dev
```

Starts the Express backend on port 3001 and the React dev server on port 3000 concurrently.

### Build for production

```bash
npm run build   # builds the React app
npm start       # serves everything from Express on port 3001
```
