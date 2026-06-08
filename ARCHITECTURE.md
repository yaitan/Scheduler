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
| **PDF generation** | `pdfkit` | Streams invoice PDFs directly from Express; Rubik font embedded for Hebrew + Latin + ₪ glyph support |
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
│       ├── App.js               # Root: auth gate, view router, persistent topbar nav
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
│       │   ├── SessionModal.js       # Unified new + edit session modal
│       │   ├── PaymentModal.js       # Unified new + edit payment modal
│       │   ├── ClientModal.js        # Unified new + edit client modal
│       │   ├── EventModal.js         # Unified new + edit event modal
│       │   ├── PdfModal.js           # PDF config modal (invoice + receipt modes): client, billing name, date range, item count, PDF download
│       │   ├── DurationInput.js      # Shared H:MM segment input (Session/EventModal)
│       │   ├── LocationCombobox.js   # Shared location combobox (Session/ClientModal)
│       │   ├── ConfirmDeleteModal.js # Reusable delete-confirmation overlay
│       │   ├── YearlySummaryModal.js
│       │   └── LoginScreen.js
│       │
│       ├── styles/              # CSS scoped per view/component
│       │   ├── global.css
│       │   ├── calendar.css
│       │   ├── week.css
│       │   ├── day.css
│       │   ├── clients.css
│       │   ├── payments.css
│       │   ├── login.css
│       │   ├── datepicker-theme.css
│       │   └── yearly-summary.css
│       │
│       └── utils/
│           ├── api.js                                  # apiFetch wrapper + token management
│           ├── dateUtils.js                            # Date arithmetic helpers
│           ├── modalConstants.js                       # Shared UI constants (LOCATION_OPTIONS, PAYMENT_METHODS)
│           ├── israeliHolidays.js                      # Holiday lookup functions
│           └── israeli_holidays_shabbat_2026_2027.json # Static holiday dataset
│
└── server/                      # Express backend
    ├── package.json
    ├── index.js                 # App entry: init DB, mount routes, serve static build
    ├── .env                     # APP_PASSWORD, JWT_SECRET, PORT, DB_PATH, BUSINESS_NAME, BUSINESS_NUMBER, BUSINESS_EMAIL, BUSINESS_PHONE, BUSINESS_TAX_RATE, BUSINESS_WITHHOLDING_TAX
    │
    ├── middleware/
    │   └── requireAuth.js       # JWT verification applied to all /api/* except /api/auth
    │
    ├── config/                  # (directory kept for local overrides; business.json removed)
    │
    ├── fonts/
    │   ├── Rubik-Regular.ttf    # Embedded in PDF invoices; covers Hebrew, Latin, ₪
    │   └── Rubik-Bold.ttf
    │
    ├── routes/
    │   ├── auth.js              # POST /api/auth/verify
    │   ├── clients.js           # CRUD for clients + derived stats
    │   ├── sessions.js          # CRUD for sessions + overlap check
    │   ├── payments.js          # CRUD for payments + summary/owed endpoints
    │   ├── events.js            # CRUD for calendar events; unique constraint on (date, time)
    │   ├── backup.js            # GET /api/backup — streams DB file as binary download
    │   └── pdf.js               # GET /api/pdf/invoice — streams a Hebrew RTL invoice PDF via pdfkit
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
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  rate         REAL NOT NULL,
  contact_info TEXT,
  billing_name TEXT,
  location     TEXT NOT NULL DEFAULT ''
);
```

`id` is a synthetic integer primary key. `name` carries a `UNIQUE` constraint — at personal scale no two clients share a name. All cross-table foreign keys reference `clients.id`. See [Design Decisions](#5-key-design-decisions).

`billing_name` overrides `name` on generated PDFs (invoices and receipts). `contact_info` is a free-text field (e.g. phone number) displayed below the client name on PDFs.

All financial and session statistics (balance owed, total hours, revenue, upcoming sessions) are **derived at query time** — never stored in this table.

---

### `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL,
  date        TEXT NOT NULL,    -- ISO 8601: YYYY-MM-DD
  time        TEXT NOT NULL,    -- HH:MM (24-hour)
  duration    INTEGER NOT NULL, -- minutes; 90 = 1h 30m
  rate        REAL NOT NULL,    -- ₪/hour at time of session; cost = duration * rate / 60
  status      TEXT NOT NULL DEFAULT 'Scheduled'
                CHECK(status IN ('Scheduled', 'Completed', 'Cancelled')),
  location    TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

Each session has a synthetic integer `id` as its primary key. Duration is stored in **minutes** (integer). `rate` captures the hourly rate at booking time, so billing remains accurate even if the client's default rate is later changed. Overlap across all non-cancelled sessions on a given date is enforced in application code via `hasOverlap()` — the constraint requires time-interval arithmetic that a DB unique index cannot express.

---

### `payments`

```sql
CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY,
  client_id      INTEGER NOT NULL,
  date           TEXT NOT NULL,   -- ISO 8601: YYYY-MM-DD
  amount         REAL NOT NULL,
  method         TEXT NOT NULL
                   CHECK(method IN ('PayBox', 'Bit', 'Transfer', 'Cash', 'Other')),
  receipt_number TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

Payments are identified by a synthetic integer `id`.

**Balance formula** used everywhere:

```
balance_owed = SUM(completed session duration_minutes × rate / 60) − SUM(payments)
```

A negative balance means the client has paid ahead.

---

### `events`

```sql
CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  date     TEXT NOT NULL,    -- ISO 8601: YYYY-MM-DD
  time     TEXT,             -- HH:MM (24-hour); NULL for all-day events
  duration INTEGER,          -- minutes; NULL if unspecified
  location TEXT NOT NULL DEFAULT ''
);
-- At most one timed event per date+time slot:
CREATE UNIQUE INDEX IF NOT EXISTS events_timed_unique  ON events (date, time) WHERE time IS NOT NULL;
-- At most one all-day event per date (SQLite treats NULL as distinct, so this
-- prevents duplicate all-day entries while allowing multiple timed events):
CREATE UNIQUE INDEX IF NOT EXISTS events_allday_unique ON events (date)       WHERE time IS NULL;
```

Events are display-only — they carry no financial data and are not checked for overlap against sessions. The two partial unique indexes enforce separate uniqueness rules for timed and all-day events.

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
| `GET` | `/api/clients` | All clients with derived stats (total minutes, scheduled minutes, revenue, balance, last session date). Triggers `autoCompleteSessions`. |
| `GET` | `/api/clients/:id` | Single client by integer ID; returns stats and upcoming sessions array |
| `POST` | `/api/clients` | Create a client (`name`, `rate` required; `location` optional) |
| `PUT` | `/api/clients/:id` | Update name/rate/phone/parent_phone/location; returns `409` on name collision |
| `DELETE` | `/api/clients/:id` | Delete client and all associated sessions and payments (transactional) |

### Sessions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions` | All sessions; optional `?month=YYYY-MM`, `?year=YYYY`, `?client=name`, `?client_id=N`, `?from=YYYY-MM-DD`, `?to=YYYY-MM-DD`. Triggers `autoCompleteSessions`. |
| `GET` | `/api/sessions/count` | Count of sessions for a client in a date range. Params: `client_id`, `from`, `to`. Returns `{ count }`. |
| `GET` | `/api/sessions/:session_id` | Single session by integer ID |
| `POST` | `/api/sessions` | Create session; `client_id` and `rate` required; `location` optional; runs overlap check, returns `409` on conflict |
| `PUT` | `/api/sessions/:session_id` | Update session; re-runs overlap check excluding self; client and location are editable |
| `DELETE` | `/api/sessions/:session_id` | Delete session |

### Payments

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/payments` | All payments; optional `?client=name&from=YYYY-MM-DD` |
| `GET` | `/api/payments/count` | Count of payments for a client in a date range. Params: `client_id`, `from`, `to`. Returns `{ count }`. |
| `GET` | `/api/payments/owed` | Clients with positive balance, with earliest unpaid session and minutes owed. Used by the Payments view top panel. |
| `GET` | `/api/payments/summary` | Per-client earned/paid/balance totals |
| `POST` | `/api/payments` | Log a payment; `client_id` required |
| `PUT` | `/api/payments/:payment_id` | Update an existing payment; client and date are editable |
| `DELETE` | `/api/payments/:payment_id` | Delete a payment |

### Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/events` | All events; optional `?month=YYYY-MM` or `?date=YYYY-MM-DD` filter |
| `GET` | `/api/events/:id` | Single event by integer ID |
| `POST` | `/api/events` | Create event; `name` and `date` required; returns `409` on unique-constraint violation |
| `PUT` | `/api/events/:id` | Update event; returns `409` on unique-constraint violation |
| `DELETE` | `/api/events/:id` | Delete event |

### Backup

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/backup` | Streams the live SQLite database file as a binary download with a date-stamped filename (`scheduler-backup-YYYY-MM-DD.db`). Requires JWT. |

### PDF

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/pdf/invoice` | Generates and streams a Hebrew RTL invoice PDF (חשבון עסקה) for all sessions of a client within a date range. Computes a credit line by comparing the invoice total against the client's global balance (all-time completed sessions minus all-time payments); if the client has paid ahead, the credit is deducted and the final "סה"כ לתשלום" reflects what is actually still owed. Query params: `client_id`, `from`, `to`, optional `billing_name`. Invoice number format: `3XXXX-N`. Business details from env vars (`BUSINESS_NAME`, `BUSINESS_NUMBER`, etc.). |
| `GET` | `/api/pdf/receipt` | Generates and streams a Hebrew RTL receipt PDF (קבלה) for all payments of a client within a date range. Query params: `client_id`, `from`, `to`, optional `billing_name`. Receipt number format: `8XXXX-N`. Includes payment method (translated via `METHOD_LABELS`), details, date, amount, and a withholding-tax totals block. Business details from env vars. |

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

### Integer IDs with unique name constraint
Each table uses a synthetic `INTEGER PRIMARY KEY`. Client names still carry a `UNIQUE` constraint — the business invariant that no two clients share a name is preserved. Cross-table foreign keys reference `clients.id`, which means renaming a client (via `PUT /api/clients/:id` with a new `name` in the body) no longer requires cascading updates across child tables. All single-resource client/session/payment endpoints are addressed by integer ID.

### Lazy session auto-completion
Sessions never flip from `Scheduled` to `Completed` via a background cron job. Instead, `autoCompleteSessions()` runs on every read request (every `GET` to sessions, clients, or payments). It issues a single `UPDATE` against SQLite, setting all past `Scheduled` sessions to `Completed` based on Israel time. This is cheap, correct, and requires no scheduler infrastructure.

### Derived stats only — nothing stored
Balance owed, total revenue, hours completed, and hours scheduled are never written to the database. Every query that needs them computes them inline with `SUM(CASE WHEN ...)`. This keeps the database as the single source of truth and eliminates an entire class of sync bugs.

### Israel timezone throughout
The server's `nowInIsrael()` function uses `Intl.DateTimeFormat` with `Asia/Jerusalem` to determine the current date and time for `autoCompleteSessions`. This matters because the server may run on UTC infrastructure (Railway) while the user's sessions are defined in Israel local time.

### Static holiday dataset
Israeli holidays and Shabbat candle-lighting times are stored in a static JSON file bundled with the frontend. This resolves the PRD open question about the holidays data source: no external API dependency, no network requests, works offline.

### Overlap detection in application code
The `hasOverlap()` function in `sessions.js` checks for time conflicts across all non-cancelled sessions on a given date, regardless of which client they belong to. It converts `HH:MM` times and durations (in minutes) to integer minute offsets for arithmetic. On edits, the check excludes the session being updated by its ID. This is enforced in the route handler rather than a DB constraint because it requires time arithmetic — comparing whether two intervals `(start, start+duration)` overlap — which a database unique index cannot express.

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
| **Tutoring-related events** (test days, year start/end) | Implemented | Full event CRUD added: `events` table, `/api/events` route, `EventModal` UI. Events appear as amber pills in all three calendar views (timed events on the time grid, all-day events as header pills). |
| **Cancelled session reasons** | Not implemented | Listed as "Nice to Have" in PRD §5.2. `Cancelled` status exists but no reason field. |
| **Multi-user login (wife's access)** | Not implemented | Explicitly deferred to v2 in PRD §5.3 and §8. Single-password auth is the v1 design. |
| **Create receipts / payment requests** | Implemented | `GET /api/pdf/receipt` streams a Hebrew RTL receipt PDF for a client's payments in a date range. Accessible via "Create Receipt" in the edit-payment modal (opens `PdfModal` in receipt mode, pre-filled with the payment date). |
| **Per-session rate override history** | Partially implemented | Each session now stores `rate` at booking time (`sessions.rate`), so billing is accurate even after a client's default rate changes. A full audit history of rate changes is not implemented. |
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
- **Unified modals** — each entity (session, payment, client) uses a single modal component for both create and edit flows, replacing six separate New/Edit modal files.
- **H:MM duration segment input** — custom keyboard-driven input for session duration, replacing separate hours/minutes fields.
- **`migrate_railway.js`** — standalone migration script to upgrade an existing Railway SQLite database to the new integer-ID schema without data loss.
- **`migrate_location.js`** — standalone migration script to add the `location` column to `clients` and `sessions` with an empty-string default for all existing rows. Idempotent.
- **Location field** — both clients and sessions now store a `location` string (e.g. "Zoom", "Home"). The session form defaults the field to the client's location and can be overridden per session. A custom `LocationCombobox` component shows preset options on focus while still allowing free text.
- **Persistent topbar navigation** — the hamburger/sidebar pattern was replaced with three always-visible nav buttons (Calendar, Clients, Payments) in a fixed header bar. The active view is indicated by an accent-blue underline.
- **Quick-log payment buttons** — every session block in Week and Day views has a ₪ button that opens the payment form pre-filled with the client and the calculated session cost (`duration × rate / 60`, rounded). Reduces payment logging to a single click from the calendar.
- **Day view summary row** — the Day view header shows projected income and total scheduled hours for the day side by side, separated by a vertical divider.
- **`migrate_events.js`** — standalone migration script to create the `events` table and both partial unique indexes. Idempotent.
- **`DurationInput` extracted as a shared component** — the H:MM segment duration input was originally inlined in `SessionModal`. It is now `DurationInput.js`, shared by both `SessionModal` and `EventModal`.
- **PDF invoice and receipt generation** — `GET /api/pdf/invoice` and `GET /api/pdf/receipt` stream `pdfkit`-generated Hebrew RTL PDFs for a client's sessions or payments over a date range. Both are accessible via `PdfModal` (renamed from `InvoiceModal`), which operates in `invoice` or `receipt` mode and shows a live session/payment count before download. The Rubik font is embedded for full Hebrew + ₪ glyph support. Business info (including `withholding_tax`) lives in `server/config/business.json` (gitignored).
- **`contact_info` / `billing_name` fields on clients** — replaced the earlier `phone` / `parent_phone` columns. `billing_name` overrides `name` on invoices; `contact_info` is a free-text field shown below the client name on the invoice.
