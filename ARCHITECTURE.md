# Tutoring Scheduler — Architecture Document

This document describes the final implemented architecture of the Tutoring Scheduler. It covers every layer of the system as built, key design decisions, and a gap analysis against the original PRD.

---

## 1. Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | React 18, Create React App | Familiar ecosystem; CRA eliminates bundler configuration for a personal tool |
| **Styling** | Custom CSS (no framework) | Full control over dark-mode design without framework overrides |
| **Date handling** | Custom utilities + `react-datepicker` | `date-fns` (bundled with react-datepicker) covers calendar math; custom utils handle Israel-specific logic |
| **Holiday data** | Static JSON + JS modules | Self-contained; no runtime dependency on a third-party calendar API; covers the relevant years |
| **Backend** | Node.js 22 + Express 4 | Minimal server for a personal tool; Node 22 ships `node:sqlite` natively |
| **Database** | SQLite via `node:sqlite` (built-in, no ORM) | Zero-dependency persistence; personal scale makes SQLite more than sufficient |
| **Auth** | JWT (`jsonwebtoken`) | Stateless; a single shared password is enough for a solo-user app |
| **Dev tooling** | `concurrently` + `nodemon` | Single `npm run dev` starts both services; nodemon restarts on server changes |
| **Hosting** | Railway (production) | Answered the PRD open question about hosting; `DB_PATH` env var makes the database path configurable for the deployment environment |

**Why Node 22:** The built-in `node:sqlite` module (experimental in Node 22) eliminates the `better-sqlite3` native-module build step, which matters for Railway deployments where native compilation can fail.

---

## 2. Directory / Module Structure

```
Scheduler/
├── package.json                 # Monorepo root — dev/build/start scripts, concurrently
├── PRD.md
├── README.md
├── ARCHITECTURE.md
│
├── client/                      # React frontend (Create React App)
│   ├── package.json
│   └── src/
│       ├── App.js               # Root: auth gate, view router, sidebar, header
│       ├── index.js
│       │
│       ├── views/               # Full-page view components
│       │   ├── CalendarView.js  # Month grid, summary bar, navigation
│       │   ├── WeekView.js      # Hour-block week grid, Shabbat shading
│       │   ├── DayView.js       # Overlay day view, hour slot click-to-add
│       │   ├── ClientsView.js   # Client table + per-client profile
│       │   └── PaymentsView.js  # Owed panel + full payment history
│       │
│       ├── components/          # Modals and shared UI
│       │   ├── NewSessionModal.js
│       │   ├── EditSessionModal.js
│       │   ├── NewPaymentModal.js
│       │   ├── EditPaymentModal.js
│       │   ├── NewClientModal.js
│       │   ├── EditClientModal.js
│       │   ├── YearlySummaryModal.js
│       │   ├── LoginScreen.js
│       │   └── Sidebar.js
│       │
│       ├── styles/              # CSS scoped per view/component
│       │   ├── global.css
│       │   ├── calendar.css
│       │   ├── week.css
│       │   ├── day.css
│       │   ├── clients.css
│       │   ├── payments.css
│       │   ├── sidebar.css
│       │   ├── login.css
│       │   ├── datepicker-theme.css
│       │   └── yearly-summary.css
│       │
│       └── utils/
│           ├── api.js                                  # apiFetch wrapper + token management
│           ├── dateUtils.js                            # Date arithmetic helpers
│           ├── israeliHolidays.js                      # Holiday lookup functions
│           ├── jewishHolidays.js                       # Shabbat candle-lighting calculation
│           └── israeli_holidays_shabbat_2026_2027.json # Static holiday dataset
│
└── server/                      # Express backend
    ├── package.json
    ├── index.js                 # App entry: init DB, mount routes, serve static build
    ├── .env                     # APP_PASSWORD, JWT_SECRET, PORT, DB_PATH
    │
    ├── middleware/
    │   └── requireAuth.js       # JWT verification applied to all /api/* except /api/auth
    │
    ├── routes/
    │   ├── auth.js              # POST /api/auth/verify
    │   ├── clients.js           # CRUD for clients + derived stats
    │   ├── sessions.js          # CRUD for sessions + overlap check
    │   └── payments.js          # CRUD for payments + summary/owed endpoints
    │
    └── db/
        ├── schema.sql           # CREATE TABLE IF NOT EXISTS — idempotent on startup
        └── database.js          # DatabaseSync instance, initDb(), autoCompleteSessions()
```

---

## 3. Data Model

### `clients`

```sql
CREATE TABLE IF NOT EXISTS clients (
  name         TEXT PRIMARY KEY,
  rate         REAL NOT NULL,
  phone        TEXT,
  parent_phone TEXT
);
```

`name` is the primary key. This is intentional at personal scale where no two clients share a name. See [Design Decisions](#5-key-design-decisions).

All financial and session statistics (balance owed, total hours, revenue, upcoming sessions) are **derived at query time** — never stored in this table.

---

### `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
  client_name TEXT NOT NULL,
  date        TEXT NOT NULL,   -- ISO 8601: YYYY-MM-DD
  time        TEXT NOT NULL,   -- HH:MM (24-hour)
  duration    REAL NOT NULL,   -- hours; 1.5 = 90 min
  status      TEXT NOT NULL DEFAULT 'Scheduled'
                CHECK(status IN ('Scheduled', 'Completed', 'Cancelled')),
  PRIMARY KEY (client_name, date, time),
  FOREIGN KEY (client_name) REFERENCES clients(name)
);
```

The composite PK `(client_name, date, time)` encodes the business constraint that one client cannot have two sessions at the same moment. Overlap across all clients (regardless of name) is enforced in application code, not the DB, because the constraint is about physical time slots, not the tuple.

---

### `payments`

```sql
CREATE TABLE IF NOT EXISTS payments (
  client_name    TEXT NOT NULL,
  date           TEXT NOT NULL,  -- ISO 8601: YYYY-MM-DD
  amount         REAL NOT NULL,
  method         TEXT NOT NULL
                   CHECK(method IN ('PayBox', 'Bit', 'Transfer', 'Cash', 'Other')),
  receipt_number TEXT,
  PRIMARY KEY (client_name, date),
  FOREIGN KEY (client_name) REFERENCES clients(name)
);
```

The composite PK `(client_name, date)` means at most one payment per client per calendar date. This was an acceptable simplification; if two payments are received from the same client on the same day they would need to be combined.

**Balance formula** used everywhere:

```
balance_owed = SUM(completed session hours × rate) − SUM(payments)
```

A negative balance means the client has paid ahead.

---

## 4. API Routes

All routes except `POST /api/auth/verify` and `GET /api/health` require a valid JWT in the `Authorization: Bearer <token>` header.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/verify` | Validates `APP_PASSWORD`, returns a signed JWT |

### Clients

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/clients` | All clients with derived stats (total hours, scheduled hours, revenue, balance, last session date). Triggers `autoCompleteSessions`. |
| `GET` | `/api/clients/:name` | Single client with total/scheduled sessions, hours, balance, and upcoming sessions array |
| `POST` | `/api/clients` | Create a client (`name`, `rate` required) |
| `PUT` | `/api/clients/:name` | Update rate/phone/parent_phone |
| `DELETE` | `/api/clients/:name` | Delete client and all associated sessions and payments (transactional) |

### Sessions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions` | All sessions; optional `?month=YYYY-MM`, `?year=YYYY`, `?client=name`. Triggers `autoCompleteSessions`. |
| `GET` | `/api/sessions/:client/:date/:time` | Single session by composite key |
| `POST` | `/api/sessions` | Create session; runs overlap check, returns `409` on conflict |
| `PUT` | `/api/sessions/:client/:date/:time` | Update session; re-runs overlap check; guards against editing a future time to a past status |
| `DELETE` | `/api/sessions/:client/:date/:time` | Delete session |

### Payments

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/payments` | All payments; optional `?client=name&from=YYYY-MM-DD` |
| `GET` | `/api/payments/owed` | Clients with positive balance, with earliest unpaid session and hours owed. Used by the Payments view top panel. |
| `GET` | `/api/payments/summary` | Per-client earned/paid/balance totals |
| `GET` | `/api/payments/:client` | Payment history for one client |
| `POST` | `/api/payments` | Log a payment |
| `PUT` | `/api/payments/:client/:date` | Update an existing payment |
| `DELETE` | `/api/payments/:client/:date` | Delete a payment |

### Static / SPA fallback

In production, Express serves the React build from `client/build/` and sends `index.html` for all non-API routes, making the entire app a single deployable unit on one port.

---

## 5. Auth Flow

```
Browser                          Express
  │                                 │
  │  POST /api/auth/verify          │
  │  { password: "..." }  ─────────►│
  │                                 │  compare to APP_PASSWORD env var
  │◄──────────── { token: JWT } ────│  sign with JWT_SECRET (no expiry)
  │                                 │
  │  store token in localStorage    │
  │                                 │
  │  GET /api/sessions              │
  │  Authorization: Bearer <token>─►│
  │                                 │  requireAuth middleware
  │                                 │  jwt.verify(token, JWT_SECRET)
  │◄──────────── 200 [...] ─────────│
  │                                 │
  │  any 401 response               │
  │  ──────────────────────────────►│
  │  clearToken()                   │
  │  dispatch auth:logout event     │
  │  → App.js unmounts, shows       │
  │    LoginScreen                  │
```

Key properties:
- **No expiry** on the JWT (removed after early testing). The session persists until `localStorage` is cleared or a 401 is received.
- **Single password** — no username. Designed for one user, with the intention that a multi-user system (the original "v2" open question) is a future concern.
- **Automatic logout** — the `apiFetch` wrapper in `utils/api.js` listens for any 401 response and fires a DOM event (`auth:logout`) that `App.js` catches to reset auth state.

---

## 6. Key Design Decisions

### Dark mode as the default
The entire UI is dark mode by default with no light mode toggle. This was an explicit PRD requirement and is implemented entirely in custom CSS using dark background and light foreground colour values throughout. No CSS framework or `prefers-color-scheme` media query is involved — dark is the only theme.

### Client name as primary key
The `clients.name` column is the primary key across all three tables. This avoids a surrogate ID and keeps URLs and API payloads readable (`/api/sessions/Alice/2025-09-01/09:00`). The trade-off is that renaming a client is not supported (it would require cascading updates across all foreign keys). Acceptable at personal scale where names are stable.

### Lazy session auto-completion
Sessions never flip from `Scheduled` to `Completed` via a background cron job. Instead, `autoCompleteSessions()` runs on every read request (every `GET` to sessions, clients, or payments). It issues a single `UPDATE` against SQLite, setting all past `Scheduled` sessions to `Completed` based on Israel time. This is cheap, correct, and requires no scheduler infrastructure.

### Derived stats only — nothing stored
Balance owed, total revenue, hours completed, and hours scheduled are never written to the database. Every query that needs them computes them inline with `SUM(CASE WHEN ...)`. This keeps the database as the single source of truth and eliminates an entire class of sync bugs.

### Israel timezone throughout
The server's `nowInIsrael()` function uses `Intl.DateTimeFormat` with `Asia/Jerusalem` to determine the current date and time for `autoCompleteSessions`. This matters because the server may run on UTC infrastructure (Railway) while the user's sessions are defined in Israel local time.

### Static holiday dataset
Israeli holidays and Shabbat candle-lighting times are stored in a static JSON file bundled with the frontend. This resolves the PRD open question about the holidays data source: no external API dependency, no network requests, works offline.

### Overlap detection in application code
The `hasOverlap()` function in `sessions.js` checks for time conflicts across all non-cancelled sessions on a given date, regardless of which client they belong to. It converts `HH:MM` times and durations to minutes for arithmetic. This is enforced in the route handler rather than a DB constraint because it requires time arithmetic — comparing whether two intervals `(start, start+duration)` overlap — which a database unique index cannot express.

### Payments can go negative (pay ahead)
The balance formula deliberately allows negative balances. Clients who pay before all sessions are completed will show a negative (credit) balance. The Payments view top panel only shows clients with `balance_owed > 0`, so pre-paid clients don't appear as owing anything.

### Client delete is transactional
`DELETE /api/clients/:name` wraps three deletes (payments → sessions → client) in a manual `BEGIN / COMMIT / ROLLBACK` block. SQLite foreign keys in `node:sqlite` are enabled by the schema, but the explicit transaction ensures atomicity even if FK enforcement were off.

### Single deployable unit
In production, Express serves both the API and the compiled React frontend. There is no separate static host. This simplifies Railway configuration to a single service with a single port.

---

## 7. PRD Differences

### What was in the PRD but not implemented

| PRD Item | Status | Notes |
|---|---|---|
| **Recurring sessions** | Not implemented | Listed as "Nice to Have" in PRD §5.2. No auto-generation of future sessions exists. |
| **Tutoring-related events** (test days, year start/end) | Not implemented | Listed as "Nice to Have" in PRD §5.2. Can technically be inserted with a client with a rate of zero - but this would affect the total hours summary |
| **Cancelled session reasons** | Not implemented | Listed as "Nice to Have" in PRD §5.2. `Cancelled` status exists but no reason field. |
| **Multi-user login (wife's access)** | Not implemented | Explicitly deferred to v2 in PRD §5.3 and §8. Single-password auth is the v1 design. |
| **Create receipts / payment requests** | Not implemented | Explicitly deferred to v2 in PRD §5.3. |
| **Per-session rate override history** | Not implemented | Explicitly deferred to v2 in PRD §5.3. |
| **Monthly report with cancellation analysis** | Not implemented | Explicitly deferred to v2 in PRD §5.3. |
| **Day View as overlay over current view** | Implemented as specified | PRD §6 described it as an "enlarged overlay/modal" — this is what was built. |
| **Hosting** | Implemented (Railway) | PRD §8 left this as an open question; resolved in implementation. |

### What was added beyond the PRD

- **Yearly summary modal** — revenue and hours broken down by month; accessible from the month view header.
- **ISO week numbers** — shown on the left edge of the month grid.
- **Contextual navigation shortcuts** beyond the PRD: the `Total Owed` figure in the summary bar links to the Payments view; clicking a month in the yearly summary modal navigates to that month; ISO week number cells in the month grid link to the corresponding week view; clicking the app title in the header returns to the current month.
- **Mobile UX improvements** — responsive adjustments for small screens, beyond the PRD's "web only" scope.
- **`DB_PATH` env var** — makes the SQLite file location configurable, required for Railway deployment.
- **`SIGTERM` handler** — graceful shutdown for container environments.
