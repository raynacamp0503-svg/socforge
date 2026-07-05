import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'socforge.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// Wrap a function in a SQLite transaction (node:sqlite has no .transaction helper).
export const withTransaction = (fn) => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  index_name TEXT NOT NULL,
  sourcetype TEXT NOT NULL,
  host TEXT,
  "user" TEXT,
  src_ip TEXT,
  dest_ip TEXT,
  event_code TEXT,
  process_name TEXT,
  severity TEXT DEFAULT 'info',
  message TEXT NOT NULL,
  extra TEXT DEFAULT '{}',
  scenario_key TEXT,
  alert_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_alert ON events(alert_id);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT NOT NULL,
  scenario_key TEXT,
  detection TEXT DEFAULT '',
  mitre TEXT DEFAULT '[]',
  entities TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL REFERENCES alerts(id),
  status TEXT DEFAULT 'new',
  priority TEXT DEFAULT 'medium',
  disposition TEXT,
  sla_due INTEGER,
  notes TEXT DEFAULT '',
  evidence TEXT DEFAULT '[]',
  checklist_state TEXT DEFAULT '[]',
  hints_used INTEGER DEFAULT 0,
  score INTEGER,
  score_breakdown TEXT,
  report TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  enabled INTEGER DEFAULT 1,
  last_fired INTEGER,
  created_at INTEGER NOT NULL
);
`);

export const jparse = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};
