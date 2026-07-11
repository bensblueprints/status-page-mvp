const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function nativeBindingPath() {
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function genToken(len = 22) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const COMPONENT_STATUSES = ['operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance'];
const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'];
const IMPACTS = ['minor', 'major', 'critical'];

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const nativeBinding = nativeBindingPath();
  const db = new Database(dbPath, nativeBinding ? { nativeBinding } : {});
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'operational',
      sort_order INTEGER NOT NULL DEFAULT 0,
      webhook_token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      changed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'investigating',
      impact TEXT NOT NULL DEFAULT 'minor',
      created_at INTEGER NOT NULL,
      resolved_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS incident_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      components_json TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      confirmed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS uptime_daily (
      component_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      pct REAL NOT NULL,
      PRIMARY KEY (component_id, date)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_component ON status_events(component_id, changed_at);
    CREATE INDEX IF NOT EXISTS idx_updates_incident ON incident_updates(incident_id, created_at);
  `);

  return db;
}

const DEFAULT_SETTINGS = {
  site_name: 'Upkeep Status',
  base_url: '',
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: ''
};

function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  if (process.env.SITE_NAME) out.site_name = process.env.SITE_NAME;
  if (process.env.BASE_URL) out.base_url = process.env.BASE_URL;
  if (process.env.SMTP_HOST) out.smtp_host = process.env.SMTP_HOST;
  if (process.env.SMTP_PORT) out.smtp_port = process.env.SMTP_PORT;
  if (process.env.SMTP_USER) out.smtp_user = process.env.SMTP_USER;
  if (process.env.SMTP_PASS) out.smtp_pass = process.env.SMTP_PASS;
  if (process.env.SMTP_FROM) out.smtp_from = process.env.SMTP_FROM;
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    if (r.value !== '' && r.value != null) out[r.key] = r.value;
  }
  return out;
}

function setSettings(db, obj) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) {
      if (k in DEFAULT_SETTINGS) stmt.run(k, String(v ?? ''));
    }
  });
  tx(Object.entries(obj));
}

module.exports = {
  openDb, genToken, getSettings, setSettings, DEFAULT_SETTINGS,
  COMPONENT_STATUSES, INCIDENT_STATUSES, IMPACTS
};
