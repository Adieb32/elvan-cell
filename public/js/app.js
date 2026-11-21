// =============================================
//  ELVAN CELL - Frontend
// =============================================
const $ = (id) => document.getElementById(id);
const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDate = (s) => new Date(s + 'T00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDT = (s) => s ? s.replace('T', ' ') : '';

const state = { user: null, date: todayStr(), counter: 'Elvan Cell', opening: { cash: 0, digital: 0 }, tx: [], accounts: [], mutations: [] };

// ---------- DATA (Supabase) ----------
// Jalankan query Supabase; lempar error dengan pesan yang mudah dipahami
async function q(promise) {
  const { data, error, count } = await promise;
  if (error) {
    if (error.status === 401 || /JWT/i.test(error.message)) { logout(); throw new Error('Belum login'); }
    throw new Error(supaError(error));
  }
  return count != null && data == null ? count : data;
}
// Ambil angka rupiah dari isian: "500.000" / "Rp 500,000" -> 500000
const n0 = (v) => (typeof v === 'number' ? Math.max(0, Math.round(v)) : Number(String(v ?? '').replace(/\D/g, '')) || 0);
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('id-ID');
const setMoney = (id, n) => { $(id).value = fmtMoney(n); };

// Format otomatis titik ribuan saat mengetik
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches || !el.matches('[data-money]')) return;
  const digitsBefore = el.value.slice(0, el.selectionStart).replace(/\D/g, '').length;
  const digits = el.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  el.value = digits ? fmtMoney(Number(digits)) : '';
  // kembalikan posisi kursor setelah format
  let pos = 0, seen = 0;
  while (pos < el.value.length && seen < digitsBefore) { if (/\d/.test(el.value[pos])) seen++; pos++; }
  el.setSelectionRange(pos, pos);
});

// Saldo awal: jangan ditimpa auto-refresh selama sedang diubah & belum disimpan
// Saldo awal: kotak isian hanya untuk mengetik angka baru.
// Kosong = pakai nilai yang sudah tersimpan. Setelah disimpan, kotak dikosongkan lagi.
let openingDirty = false;
const clearOpeningInputs = () => { $('openCash').value = ''; $('openDigital').value = ''; openingDirty = false; };
['openCash', 'openDigital'].forEach((id) => $(id).addEventListener('input', () => {
  openingDirty = $('openCash').value !== '' || $('openDigital').value !== '';
  updateEstimates();
}));
const TX_TYPES = ['Top up e-wallet', 'Tarik tunai', 'Transfer bank', 'Transfer e-wallet', 'Pulsa', 'Paket data',
  'Token listrik', 'Bayar tagihan', 'Voucher game', 'Aksesori HP', 'Jasa / lainnya'];

const DB = {
  async opening(date) {
    const rows = await q(supa.from('daily_opening').select('*').eq('date', date));
    return rows[0] || { date, cash: 0, digital: 0 };
  },
  saveOpening: (date, cash, digital) =>
    q(supa.from('daily_opening').upsert({ date, cash: n0(cash), digital: n0(digital), updated_by: state.user.username })),
  transactions: (date) =>
    q(supa.from('transactions').select('*').gte('datetime', date).lt('datetime', date + 'U')
      .order('datetime', { ascending: false }).order('id', { ascending: false })),
  accounts: () => q(supa.from('account_balances').select('*').order('id')),
  async mutations() {
    const rows = await q(supa.from('mutations').select('*, acc:account_id(name), to:to_account_id(name)')
      .order('datetime', { ascending: false }).order('id', { ascending: false }).limit(500));
    return rows.map((m) => ({ ...m, account_name: m.acc?.name, to_account_name: m.to?.name }));
  },
  async settings() {
    const rows = await q(supa.from('settings').select('key, value'));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  saveCounter: (name) => q(supa.from('settings').upsert({ key: 'counter_name', value: name })),
};

async function getProfile() {
  const { data } = await supa.auth.getSession();
  if (!data.session) { location.replace('index.html'); throw new Error('Belum login'); }
  const rows = await q(supa.from('profiles').select('*').eq('id', data.session.user.id));
  const p = rows[0];
  if (!p || p.role === 'none') {
    alert('Akun ini belum diaktifkan oleh admin.');
    await logout();
    throw new Error('Belum login');
  }
  return p;
}

function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = ''), isError ? 7000 : 3000);
}
// Jalankan aksi: tombol jadi "Menyimpan..." selama proses, error selalu ditampilkan
const wrap = (fn) => async (e) => {
  // Hanya batalkan kirim-form bawaan browser; klik biasa jangan dibatalkan
  if (e?.type === 'submit') e.preventDefault();
  const btn = e?.type === 'submit' ? e.target.querySelector('button[type="submit"]') : null;
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
  try { await fn(e); } catch (err) { if (err.message !== 'Belum login') toast(err.message || String(err), true); }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
};
// Error tak terduga juga ditampilkan, jangan diam saja
window.addEventListener('error', (e) => toast('Error: ' + (e.message || 'tidak diketahui'), true));
window.addEventListener('unhandledrejection', (e) => toast('Error: ' + ((e.reason && e.reason.message) || e.reason), true));

// ---------- LOAD ----------
async function loadAll() {
  const [opening, tx, accounts, mutations] = await Promise.all([
    DB.opening(state.date), DB.transactions(state.date), DB.accounts(), DB.mutations(),
  ]);
  Object.assign(state, { opening, tx, accounts, mutations });
  render();
}

// ---------- RENDER ----------
function summary() {
  const s = { count: state.tx.length, nominal: 0, admin: 0, cashIn: 0, cashOut: 0, digIn: 0, digOut: 0 };
  state.tx.forEach((t) => {
    s.nominal += t.nominal; s.admin += t.admin_fee;
    s.cashIn += t.cash_in; s.cashOut += t.cash_out;
    s.digIn += t.digital_in; s.digOut += t.digital_out;
  });
  s.cashDiff = s.cashIn - s.cashOut;
  s.estCash = state.opening.cash + s.cashDiff;
  s.estDigital = state.opening.digital + s.digIn - s.digOut;
  return s;
}

// Perkiraan akhir langsung mengikuti angka yang sedang diketik (sebelum disimpan)
function updateEstimates(s = summary()) {
  const cash = $('openCash').value !== '' ? n0($('openCash').value) : state.opening.cash;
  const digital = $('openDigital').value !== '' ? n0($('openDigital').value) : state.opening.digital;
  $('estCash').textContent = rp(cash + s.cashDiff);
  $('estDigital').textContent = rp(digital + s.digIn - s.digOut);
  $('openingStatus').textContent = openingDirty ? '● Belum disimpan — tekan Simpan saldo awal' : '';
  $('openingSaved').textContent = `Tersimpan untuk tanggal ini: tunai ${rp(state.opening.cash)} · digital ${rp(state.opening.digital)}`;
}

function render() {
  const s = summary();
  $('brandName').textContent = state.counter.toUpperCase();
  $('stCount').textContent = s.count;
  $('stNominal').textContent = rp(s.nominal);
  $('stAdmin').textContent = rp(s.admin);
  $('stCashDiff').textContent = (s.cashDiff < 0 ? '-' : '') + rp(Math.abs(s.cashDiff));
  $('stCashDiff').className = s.cashDiff < 0 ? 'text-red' : 'text-green';
  $('openCash').placeholder = 'Tersimpan: ' + fmtMoney(state.opening.cash);
  $('openDigital').placeholder = 'Tersimpan: ' + fmtMoney(state.opening.digital);
  updateEstimates(s);
  $('txDateLabel').textContent = fmtDate(state.date);

  // Transaksi
  $('txBody').innerHTML = state.tx.length
    ? state.tx.map((t) => `
      <tr>
        <td>${esc(t.datetime.slice(11))}</td><td>${esc(t.type)}</td>
        <td class="num">${rp(t.nominal)}</td><td class="num text-green">${rp(t.admin_fee)}</td>
        <td class="num">${rp(t.cash_in)}</td><td class="num">${rp(t.cash_out)}</td>
        <td class="num">${rp(t.digital_in)}</td><td class="num">${rp(t.digital_out)}</td>
        <td>${esc(t.method)}</td><td>${esc(t.note)}</td><td>${esc(t.created_by)}</td>
        <td><button class="btn btn-danger btn-sm" data-del-tx="${t.id}">Hapus</button></td>
      </tr>`).join('')
    : '<tr><td colspan="12" class="empty">Belum ada transaksi pada tanggal ini.</td></tr>';

  // Rekening
  const total = state.accounts.reduce((a, b) => a + b.balance, 0);
  $('accTotal').textContent = rp(total);
  $('accCount').textContent = state.accounts.length + ' rekening';
  $('accList').innerHTML = state.accounts.length
    ? state.accounts.map((a) => `
      <div class="acc-item">
        <div><b>${esc(a.name)}</b><span class="${a.balance < 0 ? 'text-red' : ''}">${rp(a.balance)}</span></div>
        ${isAdmin() ? `<button class="btn btn-danger btn-sm" data-del-acc="${a.id}" title="Hapus rekening">✕</button>` : ''}
      </div>`).join('')
    : '<p class="empty" style="grid-column:1/-1">Belum ada rekening. Tambahkan rekening pertama di bawah.</p>';

  const opts = state.accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  const keepA = $('mutAccount').value, keepT = $('mutTo').value;
  $('mutAccount').innerHTML = '<option value="">Pilih rekening</option>' + opts;
  $('mutTo').innerHTML = '<option value="">Pilih rekening</option>' + opts;
  $('mutAccount').value = keepA; $('mutTo').value = keepT;

  // Mutasi
  const label = { in: 'Saldo masuk', out: 'Saldo keluar', transfer: 'Transfer' };
  $('mutBody').innerHTML = state.mutations.length
    ? state.mutations.map((m) => `
      <tr>
        <td>${esc(fmtDT(m.datetime))}</td><td>${label[m.type]}</td>
        <td>${esc(m.account_name || '-')}${m.type === 'transfer' ? ' → ' + esc(m.to_account_name || '-') : ''}</td>
        <td class="num ${m.type === 'out' ? 'text-red' : m.type === 'in' ? 'text-green' : ''}">${m.type === 'out' ? '-' : ''}${rp(m.amount)}</td>
        <td>${esc(m.note)}</td><td>${esc(m.created_by)}</td>
        <td><button class="btn btn-danger btn-sm" data-del-mut="${m.id}">Hapus</button></td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="empty">Belum ada mutasi saldo.</td></tr>';
}

const isAdmin = () => state.user?.role === 'admin';

// ---------- EVENTS ----------
$('date').addEventListener('change', wrap(async () => {
  state.date = $('date').value || todayStr();
  clearOpeningInputs();
  $('txDatetime').value = `${state.date}T${nowTime()}`;
  await loadAll();
}));
$('btnToday').addEventListener('click', wrap(async () => {
  state.date = todayStr(); $('date').value = state.date;
  clearOpeningInputs();
  $('txDatetime').value = `${state.date}T${nowTime()}`;
  await loadAll();
}));
$('btnSaveCounter').addEventListener('click', wrap(async () => {
  state.counter = $('counterName').value.trim() || 'Elvan Cell';
  await DB.saveCounter(state.counter);
  render(); toast('Nama counter disimpan');
}));

$('openingForm').addEventListener('submit', wrap(async () => {
  if (!openingDirty) throw new Error('Ketik saldo awal dulu sebelum menyimpan');
  // Kotak yang dikosongkan tetap memakai nilai yang sudah tersimpan
  const cash = $('openCash').value !== '' ? n0($('openCash').value) : state.opening.cash;
  const digital = $('openDigital').value !== '' ? n0($('openDigital').value) : state.opening.digital;
  await DB.saveOpening(state.date, cash, digital);
  // Pastikan benar-benar tersimpan di database
  const saved = await DB.opening(state.date);
  if (saved.cash !== cash || saved.digital !== digital) throw new Error('Saldo awal gagal tersimpan, coba lagi');
  clearOpeningInputs();
  await loadAll();
  toast(`Saldo awal ${fmtDate(state.date)} disimpan: tunai ${rp(cash)}, digital ${rp(digital)}`);
}));

$('accForm').addEventListener('submit', wrap(async () => {
  const name = $('accName').value.trim().slice(0, 100);
  if (!name) throw new Error('Nama rekening wajib diisi');
  await q(supa.from('accounts').insert({ name, initial_balance: n0($('accInitial').value) }));
  $('accForm').reset(); setMoney('accInitial', 0);
  await loadAll(); toast('Rekening ditambahkan');
}));

$('mutType').addEventListener('change', () => {
  const t = $('mutType').value === 'transfer';
  $('mutToWrap').hidden = !t;
  $('mutAccountLabel').textContent = t ? 'Rekening asal' : 'Rekening';
});
$('mutForm').addEventListener('submit', wrap(async () => {
  const type = $('mutType').value, acc = Number($('mutAccount').value), to = Number($('mutTo').value), amount = n0($('mutAmount').value);
  if (!acc) throw new Error('Pilih rekening');
  if (type === 'transfer' && !to) throw new Error('Pilih rekening tujuan');
  if (type === 'transfer' && to === acc) throw new Error('Rekening asal dan tujuan tidak boleh sama');
  if (amount <= 0) throw new Error('Nominal wajib diisi');
  await q(supa.from('mutations').insert({
    type, account_id: acc, to_account_id: type === 'transfer' ? to : null, amount,
    note: $('mutNote').value.trim().slice(0, 200), datetime: `${todayStr()}T${nowTime()}`, created_by: state.user.username,
  }));
  $('mutAmount').value = ''; $('mutNote').value = '';
  await loadAll(); toast('Mutasi disimpan');
}));

// Isi otomatis arus uang berdasarkan jenis transaksi
$('btnAutoFill').addEventListener('click', () => {
  const n = n0($('txNominal').value), a = n0($('txAdmin').value), type = $('txType').value;
  const set = (ci, co, di, dout) => { setMoney('txCashIn', ci); setMoney('txCashOut', co); setMoney('txDigIn', di); setMoney('txDigOut', dout); };
  if (!n) return toast('Isi nominal transaksi dulu', true);
  if (type === 'Tarik tunai') set(0, n, n + a, 0);
  else if (type === 'Aksesori HP' || type === 'Jasa / lainnya') set(n + a, 0, 0, 0);
  else set(n + a, 0, 0, n);
  toast('Arus uang diisi otomatis, silakan cek lagi');
});

$('txForm').addEventListener('submit', wrap(async () => {
  const datetime = $('txDatetime').value.slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(datetime)) throw new Error('Tanggal & waktu tidak valid');
  if (n0($('txNominal').value) <= 0) throw new Error('Nominal transaksi wajib diisi');
  await q(supa.from('transactions').insert({
    datetime, type: TX_TYPES.includes($('txType').value) ? $('txType').value : 'Jasa / lainnya',
    nominal: n0($('txNominal').value), admin_fee: n0($('txAdmin').value),
    cash_in: n0($('txCashIn').value), cash_out: n0($('txCashOut').value),
    digital_in: n0($('txDigIn').value), digital_out: n0($('txDigOut').value),
    method: $('txMethod').value, note: $('txNote').value.trim().slice(0, 200), created_by: state.user.username,
  }));
  ['txNominal', 'txNote'].forEach((id) => ($(id).value = ''));
  ['txAdmin', 'txCashIn', 'txCashOut', 'txDigIn', 'txDigOut'].forEach((id) => setMoney(id, 0));
  const d = $('txDatetime').value.slice(0, 10);
  $('txDatetime').value = `${state.date}T${nowTime()}`;
  if (d !== state.date) { state.date = d; $('date').value = d; }
  await loadAll(); toast('Transaksi disimpan');
}));

document.addEventListener('click', wrap(async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.delTx && confirm('Hapus transaksi ini?')) {
    await q(supa.from('transactions').delete().eq('id', b.dataset.delTx)); await loadAll(); toast('Transaksi dihapus');
  } else if (b.dataset.delMut && confirm('Hapus mutasi ini?')) {
    await q(supa.from('mutations').delete().eq('id', b.dataset.delMut)); await loadAll(); toast('Mutasi dihapus');
  } else if (b.dataset.delAcc && confirm('Hapus rekening ini beserta semua mutasinya?')) {
    await q(supa.from('accounts').delete().eq('id', b.dataset.delAcc)); await loadAll(); toast('Rekening dihapus');
  }
}));

$('btnClearDay').addEventListener('click', wrap(async () => {
  if (!confirm(`Hapus SEMUA transaksi tanggal ${fmtDate(state.date)}? Tindakan ini tidak bisa dibatalkan.`)) return;
  const deleted = await q(supa.rpc('clear_day', { p_date: state.date }));
  await loadAll(); toast(deleted + ' transaksi dihapus');
}));

// Dropdown
document.querySelectorAll('[data-dd]').forEach((btn) =>
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = $(btn.dataset.dd);
    document.querySelectorAll('.dropdown.open').forEach((o) => o !== dd && o.classList.remove('open'));
    dd.classList.toggle('open');
  })
);
document.addEventListener('click', () => document.querySelectorAll('.dropdown.open').forEach((o) => o.classList.remove('open')));

// Modal
const openModal = (id) => $(id).classList.add('open');
document.querySelectorAll('.modal').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m || e.target.hasAttribute('data-close')) m.classList.remove('open'); });
});

// Users
const ROLE_LABEL = { admin: 'Admin', kasir: 'Kasir', none: 'Nonaktif' };
async function loadUsers() {
  const users = await q(supa.from('profiles').select('*').order('created_at'));
  $('userBody').innerHTML = users.map((u) => `
    <tr><td>${esc(u.username)}</td><td>${esc(u.full_name)}</td><td>${ROLE_LABEL[u.role] || u.role}</td>
    <td>${u.id === state.user.id ? '<span class="pill">Anda</span>' : `
      <select class="input" data-role-user="${u.id}" style="min-height:32px;padding:4px 8px">
        ${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${v}</option>`).join('')}
      </select>`}</td></tr>`).join('');
}
$('userBody').addEventListener('change', wrap(async (e) => {
  const sel = e.target.closest('[data-role-user]');
  if (!sel) return;
  await q(supa.from('profiles').update({ role: sel.value }).eq('id', sel.dataset.roleUser));
  toast('Peran diubah menjadi ' + ROLE_LABEL[sel.value]);
}));
$('btnUsers').addEventListener('click', wrap(async () => { await loadUsers(); openModal('modalUsers'); }));
$('userForm').addEventListener('submit', wrap(async () => {
  const username = $('nuUsername').value.trim().toLowerCase();
  const password = $('nuPassword').value;
  if (!/^[a-z0-9_.]{3,50}$/.test(username)) throw new Error('Username 3-50 karakter (huruf kecil, angka, titik, garis bawah)');
  if (password.length < 6) throw new Error('Password minimal 6 karakter');
  // Pakai klien terpisah agar sesi admin tidak tergantikan oleh akun baru
  const temp = supabase.createClient(ELVAN_CONFIG.SUPABASE_URL, ELVAN_CONFIG.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'elvan-temp' } });
  const { data, error } = await temp.auth.signUp({
    email: usernameToEmail(username), password,
    options: { data: { username, full_name: $('nuName').value.trim() || username } },
  });
  if (error) throw new Error(supaError(error));
  if (!data.user || !data.session) {
    throw new Error('Akun dibuat, tapi perlu konfirmasi email. Matikan "Confirm email" di Supabase (Authentication → Sign In / Providers → Email).');
  }
  await temp.auth.signOut();
  await q(supa.from('profiles').update({ role: $('nuRole').value }).eq('id', data.user.id));
  $('userForm').reset(); await loadUsers(); toast('Pengguna ditambahkan');
}));

// Password
$('btnPassword').addEventListener('click', () => openModal('modalPassword'));
$('passForm').addEventListener('submit', wrap(async () => {
  const { error: e1 } = await supa.auth.signInWithPassword({ email: usernameToEmail(state.user.username), password: $('oldPass').value });
  if (e1) throw new Error('Password lama salah');
  if ($('newPass').value.length < 6) throw new Error('Password baru minimal 6 karakter');
  const { error } = await supa.auth.updateUser({ password: $('newPass').value });
  if (error) throw new Error(supaError(error));
  $('passForm').reset(); $('modalPassword').classList.remove('open'); toast('Password berhasil diganti');
}));

// Logout
$('btnLogout').addEventListener('click', () => { $('btnLogout').textContent = 'Keluar...'; logout(); });

// Backup & import
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('btnBackup').addEventListener('click', wrap(async () => {
  const data = { app: 'elvan-cell', exported_at: new Date().toISOString() };
  for (const t of ['settings', 'daily_opening', 'accounts', 'mutations', 'transactions']) {
    data[t] = [];
    for (let from = 0; ; from += 1000) {
      const rows = await q(supa.from(t).select('*').range(from, from + 999));
      data[t].push(...rows);
      if (rows.length < 1000) break;
    }
  }
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `backup-elvan-cell-${todayStr()}.json`);
  toast('Backup diunduh');
}));
$('btnImport').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', wrap(async () => {
  const f = $('importFile').files[0]; $('importFile').value = '';
  if (!f) return;
  if (!confirm('Import akan MENGGANTI semua data (transaksi, rekening, mutasi) dengan isi file backup. Lanjutkan?')) return;
  const data = JSON.parse(await f.text());
  if (!data || data.app !== 'elvan-cell') throw new Error('File backup tidak valid');
  await q(supa.rpc('restore_backup', { data }));
  await loadAll(); toast('Data berhasil dipulihkan');
}));

// =============================================
//  UNDUH REKAP: GAMBAR / EXCEL / WORD
// =============================================
const fileBase = () => `rekap-${state.counter.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${state.date}`;

function rekapHTML(forWord = false) {
  const s = summary();
  const cell = forWord ? 'style="border:1px solid #999;padding:4px 6px"' : '';
  const numCell = forWord ? 'style="border:1px solid #999;padding:4px 6px;text-align:right"' : 'class="num"';
  const rows = state.tx.length
    ? [...state.tx].reverse().map((t, i) => `<tr>
        <td ${cell}>${i + 1}</td><td ${cell}>${esc(t.datetime.slice(11))}</td><td ${cell}>${esc(t.type)}</td>
        <td ${numCell}>${rp(t.nominal)}</td><td ${numCell}>${rp(t.admin_fee)}</td>
        <td ${numCell}>${rp(t.cash_in)}</td><td ${numCell}>${rp(t.cash_out)}</td>
        <td ${numCell}>${rp(t.digital_in)}</td><td ${numCell}>${rp(t.digital_out)}</td>
        <td ${cell}>${esc(t.method)}</td><td ${cell}>${esc(t.note)}</td></tr>`).join('')
    : `<tr><td ${cell} colspan="11" style="text-align:center">Belum ada transaksi.</td></tr>`;
  const th = (t, n) => `<th ${forWord ? 'style="border:1px solid #999;padding:4px 6px;background:#e8efff' + (n ? ';text-align:right' : '') + '"' : n ? 'class="num"' : ''}>${t}</th>`;
  const items = [
    ['Jumlah transaksi', s.count], ['Total nominal', rp(s.nominal)], ['Pendapatan admin / untung', rp(s.admin)],
    ['Kas tunai awal', rp(state.opening.cash)], ['Kas masuk / keluar', `${rp(s.cashIn)} / ${rp(s.cashOut)}`], ['Perkiraan kas tunai akhir', rp(s.estCash)],
    ['Saldo digital awal', rp(state.opening.digital)], ['Saldo digital + / −', `${rp(s.digIn)} / ${rp(s.digOut)}`], ['Perkiraan saldo digital akhir', rp(s.estDigital)],
  ];
  const sumBlock = forWord
    ? `<table style="border-collapse:collapse;width:100%;margin-bottom:14px">${items.map(([k, v]) => `<tr><td style="border:1px solid #999;padding:4px 6px;width:50%">${k}</td><td style="border:1px solid #999;padding:4px 6px"><b>${v}</b></td></tr>`).join('')}</table>`
    : `<div class="sum">${items.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  return `
    <h2>📱 ${esc(state.counter.toUpperCase())} — Rekap Transaksi Harian</h2>
    <p class="meta">${fmtDate(state.date)} · Dicetak oleh ${esc(state.user.full_name || state.user.username)}</p>
    ${sumBlock}
    <table ${forWord ? 'style="border-collapse:collapse;width:100%;font-size:10pt"' : ''}>
      <thead><tr>${th('No')}${th('Waktu')}${th('Jenis')}${th('Nominal', 1)}${th('Admin', 1)}${th('Kas masuk', 1)}${th('Kas keluar', 1)}${th('Saldo +', 1)}${th('Saldo −', 1)}${th('Metode')}${th('Keterangan')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="foot">Dibuat otomatis oleh sistem Elvan Cell pada ${new Date().toLocaleString('id-ID')}</p>`;
}

// Gambar PNG
$('dlImage').addEventListener('click', wrap(async () => {
  const sheet = $('rekapSheet');
  sheet.innerHTML = rekapHTML(false);
  toast('Membuat gambar...');
  const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff' });
  canvas.toBlob((blob) => { downloadBlob(blob, fileBase() + '.png'); toast('Gambar rekap diunduh'); }, 'image/png');
}));

// Excel
$('dlExcel').addEventListener('click', wrap(async () => {
  const s = summary();
  const wb = XLSX.utils.book_new();
  const ringkasan = [
    [`REKAP TRANSAKSI ${state.counter.toUpperCase()}`], ['Tanggal', fmtDate(state.date)], [],
    ['Keterangan', 'Nilai (Rp)'],
    ['Jumlah transaksi', s.count], ['Total nominal transaksi', s.nominal], ['Pendapatan admin / keuntungan', s.admin],
    ['Kas tunai awal', state.opening.cash], ['Uang tunai masuk', s.cashIn], ['Uang tunai keluar', s.cashOut], ['Perkiraan kas tunai akhir', s.estCash],
    ['Saldo digital awal', state.opening.digital], ['Saldo digital masuk', s.digIn], ['Saldo digital keluar', s.digOut], ['Perkiraan saldo digital akhir', s.estDigital],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(ringkasan);
  ws1['!cols'] = [{ wch: 32 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan');

  const txRows = [...state.tx].reverse().map((t, i) => ({
    No: i + 1, Waktu: t.datetime.replace('T', ' '), Jenis: t.type, Nominal: t.nominal, 'Admin/Untung': t.admin_fee,
    'Kas masuk': t.cash_in, 'Kas keluar': t.cash_out, 'Saldo digital +': t.digital_in, 'Saldo digital −': t.digital_out,
    Metode: t.method, Keterangan: t.note, Oleh: t.created_by,
  }));
  if (txRows.length) txRows.push({ No: '', Waktu: '', Jenis: 'TOTAL', Nominal: s.nominal, 'Admin/Untung': s.admin, 'Kas masuk': s.cashIn, 'Kas keluar': s.cashOut, 'Saldo digital +': s.digIn, 'Saldo digital −': s.digOut });
  const ws2 = XLSX.utils.json_to_sheet(txRows.length ? txRows : [{ Keterangan: 'Belum ada transaksi' }]);
  ws2['!cols'] = [5, 17, 18, 12, 12, 12, 12, 14, 14, 13, 28, 10].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, 'Transaksi');

  const accRows = state.accounts.map((a) => ({ Rekening: a.name, 'Saldo saat ini': a.balance }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accRows.length ? accRows : [{ Rekening: 'Belum ada rekening' }]), 'Saldo Rekening');

  XLSX.writeFile(wb, fileBase() + '.xlsx');
  toast('File Excel diunduh');
}));

// Word (.doc - dibuka langsung oleh Microsoft Word / WPS / Google Docs)
$('dlWord').addEventListener('click', () => {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><title>Rekap</title>
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
    <style>@page Section1{size:841.9pt 595.3pt;mso-page-orientation:landscape;margin:36pt}div.Section1{page:Section1}body{font-family:Calibri,Arial;font-size:11pt}</style></head>
    <body><div class="Section1">${rekapHTML(true)}</div></body></html>`;
  downloadBlob(new Blob(['﻿', html], { type: 'application/msword' }), fileBase() + '.doc');
  toast('File Word diunduh');
});

// Export mutasi ke Excel
$('dlMutations').addEventListener('click', () => {
  const label = { in: 'Saldo masuk', out: 'Saldo keluar', transfer: 'Transfer' };
  const rows = state.mutations.map((m) => ({
    'Tanggal & waktu': fmtDT(m.datetime), Mutasi: label[m.type], Rekening: m.account_name,
    'Rekening tujuan': m.to_account_name || '', Nominal: m.amount, Keterangan: m.note, Oleh: m.created_by,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Keterangan: 'Belum ada mutasi' }]), 'Mutasi');
  XLSX.writeFile(wb, `mutasi-saldo-${todayStr()}.xlsx`);
});

// Cetak
$('btnPrint').addEventListener('click', () => window.print());

// ---------- INIT ----------
(async function init() {
  try {
    state.user = await getProfile();
    $('userName').textContent = state.user.full_name || state.user.username;
    $('userRole').textContent = ROLE_LABEL[state.user.role] || state.user.role;
    if (!isAdmin()) document.querySelectorAll('.admin-only').forEach((el) => (el.style.display = 'none'));
    const settings = await DB.settings();
    state.counter = settings.counter_name || 'Elvan Cell';
    $('counterName').value = state.counter;
    $('date').value = state.date;
    $('txDatetime').value = `${state.date}T${nowTime()}`;
    await loadAll();
    // Sinkron otomatis tiap 20 detik agar data dari perangkat lain ikut tampil
    setInterval(() => { if (!document.hidden && !document.querySelector('.modal.open')) loadAll().catch(() => {}); }, 20000);
  } catch (err) {
    if (err.message !== 'Belum login') toast(err.message, true);
  }
})();
