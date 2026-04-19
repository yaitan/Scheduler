-- Tutoring Scheduler — SQLite Schema

CREATE TABLE IF NOT EXISTS clients (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  rate         REAL NOT NULL,
  phone        TEXT,
  parent_phone TEXT
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
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

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
