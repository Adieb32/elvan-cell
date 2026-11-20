// =============================================
//  ELVAN CELL - Database (libSQL / Turso)
//  - Online : isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN
//  - Lokal  : otomatis memakai file data/elvan-cell.db
// =============================================
const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let url = process.env.TURSO_DATABASE_URL;
if (!url) {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  url = 'file:' + path.join(dataDir, 'elvan-cell.db').replace(/\\/g, '/');
}
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

const toObj = (rs) => rs.rows.map((r) => Object.fromEntries(rs.columns.map((c) => [c, r[c]])));

const db = {
  async all(sql, args = []) { return toObj(await client.execute({ sql, args })); },
  async get(sql, args = []) { return (await db.all(sql, args))[0]; },
  async run(sql, args = []) {
    const rs = await client.execute({ sql, args });
    return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : null };
  },
  // Beberapa perintah sekaligus dalam satu transaksi (semua berhasil atau semua batal)
  async batch(stmts) { return client.batch(stmts.map(([sql, args = []]) => ({ sql, args })), 'write'); },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'kasir',
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS daily_opening (
  date TEXT PRIMARY KEY,
  cash INTEGER NOT NULL DEFAULT 0,
  digital INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  datetime TEXT NOT NULL,
  type TEXT NOT NULL,
  nominal INTEGER NOT NULL DEFAULT 0,
  admin_fee INTEGER NOT NULL DEFAULT 0,
  cash_in INTEGER NOT NULL DEFAULT 0,
  cash_out INTEGER NOT NULL DEFAULT 0,
  digital_in INTEGER NOT NULL DEFAULT 0,
  digital_out INTEGER NOT NULL DEFAULT 0,
  method TEXT,
  note TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tx_datetime ON transactions(datetime);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  initial_balance INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mutations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  datetime TEXT NOT NULL,
  type TEXT NOT NULL,
  account_id INTEGER,
  to_account_id INTEGER,
  amount INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by TEXT
);
`;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

db.init = async function () {
  await client.executeMultiple(SCHEMA);
  const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
  if (Number(n) === 0) {
    // Akun bawaan (hanya dibuat jika belum ada user sama sekali)
    await db.batch([
      ['INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)', ['admin', 'Admin Elvan Cell', 'admin', hashPassword('Elvan@2026')]],
      ['INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)', ['kasir', 'Kasir Elvan Cell', 'kasir', hashPassword('Kasir@2026')]],
      ["INSERT OR IGNORE INTO settings (key, value) VALUES ('counter_name', 'Elvan Cell')"],
    ]);
    console.log('  Akun bawaan dibuat: admin / Elvan@2026  dan  kasir / Kasir@2026');
  }
  console.log('  Database:', process.env.TURSO_DATABASE_URL ? 'Turso (online)' : url);
};

module.exports = db;
