// =============================================
//  ELVAN CELL - Backend (Node.js + Express + libSQL/Turso)
// =============================================
const express = require('express');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 7;

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));

// ---------- Helper ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
const num = (v) => {
  const n = Math.round(Number(v) || 0);
  return n < 0 ? 0 : n;
};
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
// Bungkus handler async agar error tidak membuat server mati
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- Auth middleware ----------
const auth = h(async (req, res, next) => {
  const token = parseCookies(req).ec_session;
  if (!token) return res.status(401).json({ error: 'Belum login' });
  const row = await db.get(
    `SELECT s.expires_at, u.id, u.username, u.full_name, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    [token]
  );
  if (!row || row.expires_at < Date.now()) {
    if (row) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
    return res.status(401).json({ error: 'Sesi berakhir, silakan login lagi' });
  }
  req.user = { id: row.id, username: row.username, full_name: row.full_name, role: row.role };
  next();
});
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Khusus admin' });
  next();
}

// ---------- AUTH ----------
app.post('/api/login', h(async (req, res) => {
  const username = str(req.body.username, 50).toLowerCase();
  const password = String(req.body.password || '');
  const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  await db.batch([
    ['INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, user.id, Date.now() + SESSION_DAYS * 86400000]],
    ['DELETE FROM sessions WHERE expires_at < ?', [Date.now()]],
  ]);
  res.setHeader(
    'Set-Cookie',
    `ec_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}` + (req.secure ? '; Secure' : '')
  );
  res.json({ ok: true, user: { username: user.username, full_name: user.full_name, role: user.role } });
}));

app.post('/api/logout', h(async (req, res) => {
  const token = parseCookies(req).ec_session;
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.setHeader('Set-Cookie', 'ec_session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
}));

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

app.post('/api/change-password', auth, h(async (req, res) => {
  const { old_password, new_password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!verifyPassword(String(old_password || ''), user.password_hash))
    return res.status(400).json({ error: 'Password lama salah' });
  if (String(new_password || '').length < 6)
    return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(new_password), user.id]);
  res.json({ ok: true });
}));

// ---------- USERS (admin) ----------
app.get('/api/users', auth, adminOnly, h(async (req, res) => {
  res.json(await db.all('SELECT id, username, full_name, role, created_at FROM users ORDER BY id'));
}));
app.post('/api/users', auth, adminOnly, h(async (req, res) => {
  const username = str(req.body.username, 50).toLowerCase();
  const full_name = str(req.body.full_name, 100) || username;
  const role = req.body.role === 'admin' ? 'admin' : 'kasir';
  const password = String(req.body.password || '');
  if (!/^[a-z0-9_.]{3,50}$/.test(username))
    return res.status(400).json({ error: 'Username 3-50 karakter (huruf kecil, angka, titik, garis bawah)' });
  if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  if (await db.get('SELECT 1 FROM users WHERE username = ?', [username]))
    return res.status(400).json({ error: 'Username sudah dipakai' });
  await db.run('INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)', [
    username, full_name, role, hashPassword(password),
  ]);
  res.json({ ok: true });
}));
app.delete('/api/users/:id', auth, adminOnly, h(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
  await db.batch([['DELETE FROM sessions WHERE user_id = ?', [id]], ['DELETE FROM users WHERE id = ?', [id]]]);
  res.json({ ok: true });
}));

// ---------- SETTINGS ----------
app.get('/api/settings', auth, h(async (req, res) => {
  const rows = await db.all('SELECT key, value FROM settings');
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}));
app.put('/api/settings', auth, h(async (req, res) => {
  const counter = str(req.body.counter_name, 100) || 'Elvan Cell';
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ['counter_name', counter]
  );
  res.json({ ok: true });
}));

// ---------- SALDO AWAL HARIAN ----------
app.get('/api/opening/:date', auth, h(async (req, res) => {
  const row = await db.get('SELECT * FROM daily_opening WHERE date = ?', [req.params.date]);
  res.json(row || { date: req.params.date, cash: 0, digital: 0 });
}));
app.put('/api/opening/:date', auth, h(async (req, res) => {
  await db.run(
    `INSERT INTO daily_opening (date, cash, digital, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET cash = excluded.cash, digital = excluded.digital, updated_by = excluded.updated_by`,
    [str(req.params.date, 10), num(req.body.cash), num(req.body.digital), req.user.username]
  );
  res.json({ ok: true });
}));

// ---------- TRANSAKSI ----------
const TX_TYPES = [
  'Top up e-wallet', 'Tarik tunai', 'Transfer bank', 'Transfer e-wallet', 'Pulsa', 'Paket data',
  'Token listrik', 'Bayar tagihan', 'Voucher game', 'Aksesori HP', 'Jasa / lainnya',
];
const METHODS = ['Tunai', 'Transfer bank', 'QRIS', 'E-wallet', 'Campuran'];

app.get('/api/transactions', auth, h(async (req, res) => {
  const { date, from, to } = req.query;
  let rows;
  if (date) {
    rows = await db.all('SELECT * FROM transactions WHERE substr(datetime,1,10) = ? ORDER BY datetime DESC, id DESC', [str(date, 10)]);
  } else if (from && to) {
    rows = await db.all(
      'SELECT * FROM transactions WHERE substr(datetime,1,10) BETWEEN ? AND ? ORDER BY datetime DESC, id DESC',
      [str(from, 10), str(to, 10)]
    );
  } else {
    rows = await db.all('SELECT * FROM transactions ORDER BY datetime DESC, id DESC LIMIT 500');
  }
  res.json(rows);
}));
app.post('/api/transactions', auth, h(async (req, res) => {
  const b = req.body;
  const datetime = str(b.datetime, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datetime)) return res.status(400).json({ error: 'Tanggal & waktu tidak valid' });
  const type = TX_TYPES.includes(b.type) ? b.type : 'Jasa / lainnya';
  const method = METHODS.includes(b.method) ? b.method : 'Tunai';
  const nominal = num(b.nominal);
  if (nominal <= 0) return res.status(400).json({ error: 'Nominal transaksi wajib diisi' });
  const info = await db.run(
    `INSERT INTO transactions (datetime, type, nominal, admin_fee, cash_in, cash_out, digital_in, digital_out, method, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [datetime, type, nominal, num(b.admin_fee), num(b.cash_in), num(b.cash_out), num(b.digital_in), num(b.digital_out),
      method, str(b.note), req.user.username]
  );
  res.json({ ok: true, id: info.lastInsertRowid });
}));
app.delete('/api/transactions/:id', auth, h(async (req, res) => {
  await db.run('DELETE FROM transactions WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
}));
app.delete('/api/transactions', auth, adminOnly, h(async (req, res) => {
  const date = str(req.query.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Tanggal tidak valid' });
  const info = await db.run('DELETE FROM transactions WHERE substr(datetime,1,10) = ?', [date]);
  res.json({ ok: true, deleted: info.changes });
}));

// ---------- REKENING ----------
app.get('/api/accounts', auth, h(async (req, res) => {
  res.json(await db.all(
    `SELECT a.*, a.initial_balance
      + COALESCE((SELECT SUM(amount) FROM mutations m WHERE m.type='in' AND m.account_id=a.id),0)
      - COALESCE((SELECT SUM(amount) FROM mutations m WHERE m.type='out' AND m.account_id=a.id),0)
      - COALESCE((SELECT SUM(amount) FROM mutations m WHERE m.type='transfer' AND m.account_id=a.id),0)
      + COALESCE((SELECT SUM(amount) FROM mutations m WHERE m.type='transfer' AND m.to_account_id=a.id),0)
      AS balance
     FROM accounts a ORDER BY a.id`
  ));
}));
app.post('/api/accounts', auth, h(async (req, res) => {
  const name = str(req.body.name, 100);
  if (!name) return res.status(400).json({ error: 'Nama rekening wajib diisi' });
  await db.run('INSERT INTO accounts (name, initial_balance) VALUES (?, ?)', [name, num(req.body.initial_balance)]);
  res.json({ ok: true });
}));
app.delete('/api/accounts/:id', auth, adminOnly, h(async (req, res) => {
  const id = Number(req.params.id);
  await db.batch([
    ['DELETE FROM mutations WHERE account_id = ? OR to_account_id = ?', [id, id]],
    ['DELETE FROM accounts WHERE id = ?', [id]],
  ]);
  res.json({ ok: true });
}));

// ---------- MUTASI SALDO ----------
app.get('/api/mutations', auth, h(async (req, res) => {
  res.json(await db.all(
    `SELECT m.*, a.name AS account_name, t.name AS to_account_name
     FROM mutations m
     LEFT JOIN accounts a ON a.id = m.account_id
     LEFT JOIN accounts t ON t.id = m.to_account_id
     ORDER BY m.datetime DESC, m.id DESC LIMIT 500`
  ));
}));
app.post('/api/mutations', auth, h(async (req, res) => {
  const type = ['in', 'out', 'transfer'].includes(req.body.type) ? req.body.type : null;
  const account_id = Number(req.body.account_id);
  const to_account_id = type === 'transfer' ? Number(req.body.to_account_id) : null;
  const amount = num(req.body.amount);
  if (!type) return res.status(400).json({ error: 'Jenis mutasi tidak valid' });
  if (!(await db.get('SELECT 1 FROM accounts WHERE id = ?', [account_id])))
    return res.status(400).json({ error: 'Pilih rekening' });
  if (type === 'transfer') {
    if (!(await db.get('SELECT 1 FROM accounts WHERE id = ?', [to_account_id])))
      return res.status(400).json({ error: 'Pilih rekening tujuan' });
    if (to_account_id === account_id) return res.status(400).json({ error: 'Rekening asal dan tujuan tidak boleh sama' });
  }
  if (amount <= 0) return res.status(400).json({ error: 'Nominal wajib diisi' });
  // Waktu mutasi dikirim dari perangkat pengguna (agar sesuai zona waktu lokal)
  let datetime = str(req.body.datetime, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datetime)) {
    datetime = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16); // cadangan: WIB
  }
  await db.run(
    'INSERT INTO mutations (datetime, type, account_id, to_account_id, amount, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [datetime, type, account_id, to_account_id, amount, str(req.body.note), req.user.username]
  );
  res.json({ ok: true });
}));
app.delete('/api/mutations/:id', auth, h(async (req, res) => {
  await db.run('DELETE FROM mutations WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- BACKUP / RESTORE (admin) ----------
const BACKUP_TABLES = {
  settings: ['key', 'value'],
  daily_opening: ['date', 'cash', 'digital', 'updated_by'],
  accounts: ['id', 'name', 'initial_balance'],
  mutations: ['id', 'datetime', 'type', 'account_id', 'to_account_id', 'amount', 'note', 'created_by'],
  transactions: ['id', 'datetime', 'type', 'nominal', 'admin_fee', 'cash_in', 'cash_out', 'digital_in', 'digital_out',
    'method', 'note', 'created_by', 'created_at'],
};
app.get('/api/backup', auth, adminOnly, h(async (req, res) => {
  const out = { app: 'elvan-cell', exported_at: new Date().toISOString() };
  for (const t of Object.keys(BACKUP_TABLES)) out[t] = await db.all(`SELECT * FROM ${t}`);
  res.json(out);
}));
app.post('/api/restore', auth, adminOnly, h(async (req, res) => {
  const d = req.body;
  if (!d || d.app !== 'elvan-cell') return res.status(400).json({ error: 'File backup tidak valid' });
  const stmts = ['transactions', 'mutations', 'accounts', 'daily_opening', 'settings'].map((t) => [`DELETE FROM ${t}`]);
  for (const [table, cols] of Object.entries(BACKUP_TABLES)) {
    for (const r of d[table] || []) {
      const use = cols.filter((c) => r[c] !== undefined);
      stmts.push([`INSERT INTO ${table} (${use.join(',')}) VALUES (${use.map(() => '?').join(',')})`, use.map((c) => r[c])]);
    }
  }
  try {
    await db.batch(stmts);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Gagal memulihkan data: ' + e.message });
  }
}));

// ---------- FRONTEND (static) ----------
app.use('/vendor/xlsx', express.static(path.join(__dirname, 'node_modules/xlsx/dist')));
app.use('/vendor/html2canvas', express.static(path.join(__dirname, 'node_modules/html2canvas/dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/login.html'));
app.get('/healthz', (req, res) => res.send('ok'));

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan di server' });
});

db.init()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  ELVAN CELL berjalan!`);
      console.log(`  - Di komputer ini : http://localhost:${PORT}`);
      Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .forEach((i) => console.log(`  - Dari HP/laptop lain (WiFi sama): http://${i.address}:${PORT}`));
      console.log('');
    });
  })
  .catch((e) => {
    console.error('Gagal terhubung ke database:', e.message);
    process.exit(1);
  });
