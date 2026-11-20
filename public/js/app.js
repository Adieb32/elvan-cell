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

// ---------- API ----------
async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { location.replace('login.html'); throw new Error('Belum login'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = ''), 2600);
}
const wrap = (fn) => async (e) => {
  e?.preventDefault?.();
  try { await fn(e); } catch (err) { if (err.message !== 'Belum login') toast(err.message, true); }
};

// ---------- LOAD ----------
async function loadAll() {
  const [opening, tx, accounts, mutations] = await Promise.all([
    api('/api/opening/' + state.date),
    api('/api/transactions?date=' + state.date),
    api('/api/accounts'),
    api('/api/mutations'),
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

function render() {
  const s = summary();
  $('brandName').textContent = state.counter.toUpperCase();
  $('stCount').textContent = s.count;
  $('stNominal').textContent = rp(s.nominal);
  $('stAdmin').textContent = rp(s.admin);
  $('stCashDiff').textContent = (s.cashDiff < 0 ? '-' : '') + rp(Math.abs(s.cashDiff));
  $('stCashDiff').className = s.cashDiff < 0 ? 'text-red' : 'text-green';
  if (document.activeElement !== $('openCash')) $('openCash').value = state.opening.cash;
  if (document.activeElement !== $('openDigital')) $('openDigital').value = state.opening.digital;
  $('estCash').textContent = rp(s.estCash);
  $('estDigital').textContent = rp(s.estDigital);
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
  $('txDatetime').value = `${state.date}T${nowTime()}`;
  await loadAll();
}));
$('btnToday').addEventListener('click', wrap(async () => {
  state.date = todayStr(); $('date').value = state.date;
  $('txDatetime').value = `${state.date}T${nowTime()}`;
  await loadAll();
}));
$('btnSaveCounter').addEventListener('click', wrap(async () => {
  state.counter = $('counterName').value.trim() || 'Elvan Cell';
  await api('/api/settings', { method: 'PUT', body: { counter_name: state.counter } });
  render(); toast('Nama counter disimpan');
}));

$('openingForm').addEventListener('submit', wrap(async () => {
  await api('/api/opening/' + state.date, { method: 'PUT', body: { cash: $('openCash').value, digital: $('openDigital').value } });
  await loadAll(); toast('Saldo awal disimpan');
}));

$('accForm').addEventListener('submit', wrap(async () => {
  await api('/api/accounts', { method: 'POST', body: { name: $('accName').value, initial_balance: $('accInitial').value } });
  $('accForm').reset(); $('accInitial').value = 0;
  await loadAll(); toast('Rekening ditambahkan');
}));

$('mutType').addEventListener('change', () => {
  const t = $('mutType').value === 'transfer';
  $('mutToWrap').hidden = !t;
  $('mutAccountLabel').textContent = t ? 'Rekening asal' : 'Rekening';
});
$('mutForm').addEventListener('submit', wrap(async () => {
  await api('/api/mutations', { method: 'POST', body: {
    type: $('mutType').value, account_id: $('mutAccount').value, to_account_id: $('mutTo').value,
    amount: $('mutAmount').value, note: $('mutNote').value, datetime: `${todayStr()}T${nowTime()}`,
  } });
  $('mutAmount').value = ''; $('mutNote').value = '';
  await loadAll(); toast('Mutasi disimpan');
}));

// Isi otomatis arus uang berdasarkan jenis transaksi
$('btnAutoFill').addEventListener('click', () => {
  const n = Number($('txNominal').value) || 0, a = Number($('txAdmin').value) || 0, type = $('txType').value;
  const set = (ci, co, di, dout) => { $('txCashIn').value = ci; $('txCashOut').value = co; $('txDigIn').value = di; $('txDigOut').value = dout; };
  if (!n) return toast('Isi nominal transaksi dulu', true);
  if (type === 'Tarik tunai') set(0, n, n + a, 0);
  else if (type === 'Aksesori HP' || type === 'Jasa / lainnya') set(n + a, 0, 0, 0);
  else set(n + a, 0, 0, n);
  toast('Arus uang diisi otomatis, silakan cek lagi');
});

$('txForm').addEventListener('submit', wrap(async () => {
  await api('/api/transactions', { method: 'POST', body: {
    datetime: $('txDatetime').value, type: $('txType').value, nominal: $('txNominal').value, admin_fee: $('txAdmin').value,
    cash_in: $('txCashIn').value, cash_out: $('txCashOut').value, digital_in: $('txDigIn').value, digital_out: $('txDigOut').value,
    method: $('txMethod').value, note: $('txNote').value,
  } });
  ['txNominal', 'txNote'].forEach((id) => ($(id).value = ''));
  ['txAdmin', 'txCashIn', 'txCashOut', 'txDigIn', 'txDigOut'].forEach((id) => ($(id).value = 0));
  const d = $('txDatetime').value.slice(0, 10);
  $('txDatetime').value = `${state.date}T${nowTime()}`;
  if (d !== state.date) { state.date = d; $('date').value = d; }
  await loadAll(); toast('Transaksi disimpan');
}));

document.addEventListener('click', wrap(async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.delTx && confirm('Hapus transaksi ini?')) {
    await api('/api/transactions/' + b.dataset.delTx, { method: 'DELETE' }); await loadAll(); toast('Transaksi dihapus');
  } else if (b.dataset.delMut && confirm('Hapus mutasi ini?')) {
    await api('/api/mutations/' + b.dataset.delMut, { method: 'DELETE' }); await loadAll(); toast('Mutasi dihapus');
  } else if (b.dataset.delAcc && confirm('Hapus rekening ini beserta semua mutasinya?')) {
    await api('/api/accounts/' + b.dataset.delAcc, { method: 'DELETE' }); await loadAll(); toast('Rekening dihapus');
  } else if (b.dataset.delUser && confirm('Hapus pengguna ini?')) {
    await api('/api/users/' + b.dataset.delUser, { method: 'DELETE' }); await loadUsers(); toast('Pengguna dihapus');
  }
}));

$('btnClearDay').addEventListener('click', wrap(async () => {
  if (!confirm(`Hapus SEMUA transaksi tanggal ${fmtDate(state.date)}? Tindakan ini tidak bisa dibatalkan.`)) return;
  const r = await api('/api/transactions?date=' + state.date, { method: 'DELETE' });
  await loadAll(); toast(r.deleted + ' transaksi dihapus');
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
async function loadUsers() {
  const users = await api('/api/users');
  $('userBody').innerHTML = users.map((u) => `
    <tr><td>${esc(u.username)}</td><td>${esc(u.full_name)}</td><td>${u.role}</td>
    <td>${u.id === state.user.id ? '<span class="pill">Anda</span>' : `<button class="btn btn-danger btn-sm" data-del-user="${u.id}">Hapus</button>`}</td></tr>`).join('');
}
$('btnUsers').addEventListener('click', wrap(async () => { await loadUsers(); openModal('modalUsers'); }));
$('userForm').addEventListener('submit', wrap(async () => {
  await api('/api/users', { method: 'POST', body: { username: $('nuUsername').value, full_name: $('nuName').value, password: $('nuPassword').value, role: $('nuRole').value } });
  $('userForm').reset(); await loadUsers(); toast('Pengguna ditambahkan');
}));

// Password
$('btnPassword').addEventListener('click', () => openModal('modalPassword'));
$('passForm').addEventListener('submit', wrap(async () => {
  await api('/api/change-password', { method: 'POST', body: { old_password: $('oldPass').value, new_password: $('newPass').value } });
  $('passForm').reset(); $('modalPassword').classList.remove('open'); toast('Password berhasil diganti');
}));

// Logout
$('btnLogout').addEventListener('click', wrap(async () => { await api('/api/logout', { method: 'POST' }); location.replace('login.html'); }));

// Backup & import
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('btnBackup').addEventListener('click', wrap(async () => {
  const data = await api('/api/backup');
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `backup-elvan-cell-${todayStr()}.json`);
  toast('Backup diunduh');
}));
$('btnImport').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', wrap(async () => {
  const f = $('importFile').files[0]; $('importFile').value = '';
  if (!f) return;
  if (!confirm('Import akan MENGGANTI semua data (transaksi, rekening, mutasi) dengan isi file backup. Lanjutkan?')) return;
  const data = JSON.parse(await f.text());
  await api('/api/restore', { method: 'POST', body: data });
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
    const me = await api('/api/me');
    state.user = me.user;
    $('userName').textContent = me.user.full_name || me.user.username;
    $('userRole').textContent = me.user.role;
    if (!isAdmin()) document.querySelectorAll('.admin-only').forEach((el) => (el.style.display = 'none'));
    const settings = await api('/api/settings');
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
