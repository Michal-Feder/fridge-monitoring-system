-- Fridge identity = branch + fridge name (D1). A logger is a sensor with an assignment history.
CREATE TABLE IF NOT EXISTS branches (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS fridges (
  id        INTEGER PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  name      TEXT NOT NULL COLLATE NOCASE,
  max_temp  REAL NOT NULL DEFAULT 5.0,   -- D2: excursion = strictly above
  min_temp  REAL,                        -- D30: stored, not evaluated yet
  UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS loggers (
  id             TEXT PRIMARY KEY,                  -- "TL-0417"
  unit           TEXT NOT NULL DEFAULT 'C' CHECK (unit IN ('C', 'F')),
  unit_confirmed INTEGER NOT NULL DEFAULT 0          -- D3: a human confirmed it once
);

-- D25: rebuilt from change points; no overlaps per logger (checked in core/assignments.ts).
CREATE TABLE IF NOT EXISTS logger_assignments (
  id         INTEGER PRIMARY KEY,
  logger_id  TEXT NOT NULL REFERENCES loggers(id),
  fridge_id  INTEGER NOT NULL REFERENCES fridges(id),
  valid_from TEXT NOT NULL,
  valid_to   TEXT
);
CREATE INDEX IF NOT EXISTS idx_assign_logger ON logger_assignments(logger_id, valid_from);
CREATE INDEX IF NOT EXISTS idx_assign_fridge ON logger_assignments(fridge_id);

CREATE TABLE IF NOT EXISTS imports (
  id          INTEGER PRIMARY KEY,
  filename    TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  row_count   INTEGER NOT NULL,
  new_rows    INTEGER NOT NULL,
  sha256      TEXT NOT NULL
);

-- D4: original value + unit are always kept next to the converted value.
CREATE TABLE IF NOT EXISTS measurements (
  id             INTEGER PRIMARY KEY,
  logger_id      TEXT NOT NULL REFERENCES loggers(id),
  fridge_id      INTEGER NOT NULL REFERENCES fridges(id),
  ts             TEXT NOT NULL,                     -- local wall clock "YYYY-MM-DDTHH:mm" (D13)
  original_value TEXT NOT NULL,
  original_unit  TEXT NOT NULL,
  value_key      TEXT NOT NULL,                     -- "3.90" and "3.9" are the same value (D14)
  temp_c         REAL,                              -- NULL for error readings (D9)
  status         TEXT NOT NULL CHECK (status IN ('ok', 'error', 'conflict')),
  import_id      INTEGER REFERENCES imports(id),
  UNIQUE (logger_id, ts, value_key)
);
CREATE INDEX IF NOT EXISTS idx_meas_fridge_ts ON measurements(fridge_id, ts);
CREATE INDEX IF NOT EXISTS idx_meas_ts ON measurements(ts);

CREATE TABLE IF NOT EXISTS import_issues (
  id        INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL REFERENCES imports(id),
  row_no    INTEGER,
  kind      TEXT NOT NULL,
  detail    TEXT NOT NULL
);
