// =============================================
//  Koneksi Supabase (dipakai login & aplikasi)
// =============================================
(function () {
  const cfg = window.ELVAN_CONFIG;
  window.supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'elvan-cell-auth' },
  });
  // "admin" -> "admin@elvancell.local"; email lengkap tetap diterima apa adanya
  window.usernameToEmail = (u) => {
    u = String(u || '').trim().toLowerCase();
    return u.includes('@') ? u : `${u}@${cfg.EMAIL_DOMAIN}`;
  };
  window.supaError = (err) => {
    const m = (err && err.message) || String(err);
    if (/Invalid login credentials/i.test(m)) return 'Username atau password salah';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Tidak bisa terhubung ke server. Cek koneksi internet.';
    if (/row-level security|permission denied/i.test(m)) return 'Akses ditolak untuk akun ini';
    if (/already registered/i.test(m)) return 'Username sudah dipakai';
    if (/Password should be/i.test(m)) return 'Password minimal 6 karakter';
    return m;
  };
})();
