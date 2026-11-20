// =============================================
//  KONFIGURASI SUPABASE
//  Ambil dari Supabase: Project Settings -> API
//  (Kunci "anon / publishable" memang aman ditaruh di sini;
//   data tetap dilindungi oleh login + Row Level Security.)
// =============================================
window.ELVAN_CONFIG = {
  SUPABASE_URL: 'ISI_PROJECT_URL',
  SUPABASE_ANON_KEY: 'ISI_ANON_KEY',
  // Domain email "bayangan" agar pengguna cukup login dengan username
  EMAIL_DOMAIN: 'elvancell.local',
};
