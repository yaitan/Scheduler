-- Tutoring Scheduler — SQLite Schema

CREATE TABLE IF NOT EXISTS clients (
  name        TEXT PRIMARY KEY,
  rate        REAL NOT NULL,
  phone       TEXT,
  parent_phone TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  client_name TEXT NOT NULL,
  date        TEXT NOT NULL,   -- ISO 8601: YYYY-MM-DD
  time        TEXT NOT NULL,   -- HH:MM (24-hour)
  duration    REAL NOT NULL,    -- hours (e.g. 1.5 = 90 minutes)
  status      TEXT NOT NULL DEFAULT 'Scheduled'
                CHECK(status IN ('Scheduled', 'Completed', 'Cancelled')),
  PRIMARY KEY (client_name, date, time),
  FOREIGN KEY (client_name) REFERENCES clients(name)
);

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
