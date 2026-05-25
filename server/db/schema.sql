-- Tutoring Scheduler — SQLite Schema

CREATE TABLE IF NOT EXISTS clients (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  rate         REAL NOT NULL,
  contact_info TEXT,
  billing_name TEXT,
  location     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY,
  client_id   INTEGER NOT NULL,
  date        TEXT NOT NULL,   -- ISO 8601: YYYY-MM-DD
  time        TEXT NOT NULL,   -- HH:MM (24-hour)
  duration    INTEGER NOT NULL, -- minutes (e.g. 90 = 1h30m)
  rate        REAL NOT NULL,    -- rate at time of session (duration * rate = session cost)
  status      TEXT NOT NULL DEFAULT 'Scheduled'
                CHECK(status IN ('Scheduled', 'Completed', 'Cancelled')),
  location    TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS events (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  date     TEXT NOT NULL,    -- ISO 8601: YYYY-MM-DD
  time     TEXT,             -- HH:MM (24-hour), NULL means all-day
  duration INTEGER,          -- minutes, NULL means no duration
  location TEXT NOT NULL DEFAULT ''
);

-- One timed event per date+time slot (time IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS events_timed_unique
  ON events(date, time) WHERE time IS NOT NULL;

-- At most one all-day event per date (time IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS events_allday_unique
  ON events(date) WHERE time IS NULL;

CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY,
  client_id      INTEGER NOT NULL,
  date           TEXT NOT NULL,  -- ISO 8601: YYYY-MM-DD
  amount         REAL NOT NULL,
  method         TEXT NOT NULL
                   CHECK(method IN ('PayBox', 'Bit', 'Transfer', 'Cash', 'Other')),
  receipt_number TEXT,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
