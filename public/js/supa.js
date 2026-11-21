// =============================================
//  Koneksi Supabase (dipakai login & aplikasi)
// =============================================
(function () {
  const cfg = window.ELVAN_CONFIG;
  window.APP_VERSION = '2.5';

  // Batasi waktu tunggu setiap permintaan agar tidak macet tanpa kabar
  const fetchWithTimeout = (url, opts = {}) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort());
    return fetch(url, { ...opts, signal: ctrl.signal })
      .catch((e) => { throw e.name === 'AbortError' ? new Error('Server tidak merespons (timeout). Cek koneksi internet lalu coba lagi.') : e; })
      .finally(() => clearTimeout(t));
  };

  // Sesi login disimpan di sessionStorage: hilang saat browser/tab ditutup,
  // jadi setiap membuka browser lagi wajib login ulang.
  const AUTH_KEY = 'elvan-cell-auth';
  try { localStorage.removeItem(AUTH_KEY); } catch (e) {} // hapus sesi lama yang dulu tersimpan permanen

  window.supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: AUTH_KEY,
      storage: window.sessionStorage,
      // Kunci sederhana di dalam tab: mencegah macet jika beberapa tab terbuka sekaligus
      lock: async (_name, _timeout, fn) => fn(),
    },
    global: { fetch: fetchWithTimeout },
  });

  // Keluar: hapus sesi di perangkat ini apa pun yang terjadi, lalu ke halaman login
  window.logout = async () => {
    try {
      await Promise.race([supa.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 3000))]);
    } catch (e) { /* tetap lanjut */ }
    try {
      [sessionStorage, localStorage].forEach((s) =>
        Object.keys(s).filter((k) => k.startsWith(AUTH_KEY) || k.startsWith('sb-')).forEach((k) => s.removeItem(k)));
    } catch (e) {}
    location.replace('index.html');
  };

  // "admin" -> "admin@elvancell.local"; email lengkap tetap diterima apa adanya
  window.usernameToEmail = (u) => {
    u = String(u || '').trim().toLowerCase();
    return u.includes('@') ? u : `${u}@${cfg.EMAIL_DOMAIN}`;
  };
  window.supaError = (err) => {
    const m = (err && err.message) || String(err);
    if (/Invalid login credentials/i.test(m)) return 'Username atau password salah';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Tidak bisa terhubung ke server. Cek koneksi internet.';
    if (/row-level security|permission denied/i.test(m)) return 'Akses ditolak untuk akun ini (' + m + ')';
    if (/already registered/i.test(m)) return 'Username sudah dipakai';
    if (/Password should be/i.test(m)) return 'Password minimal 6 karakter';
    return m;
  };
})();
