# ELVAN CELL — Sistem Rekap Transaksi & Kas Harian

- Frontend : HTML + CSS (media query, responsif) + JavaScript — di-host di **GitHub Pages**
- Backend & database : **Supabase** (login + PostgreSQL dengan Row Level Security)
- Unduh rekap: Gambar (PNG), Excel (.xlsx), Word (.doc), atau cetak

## Struktur
```
public/                 -> isi website (yang dipublikasikan GitHub Pages)
  index.html            -> halaman login
  app.html              -> halaman utama
  css/style.css         -> tampilan + media query
  js/config.js          -> URL & anon key Supabase
  js/supa.js            -> koneksi Supabase
  js/login.js, app.js   -> logika
  vendor/               -> supabase-js, SheetJS (Excel), html2canvas (gambar)
supabase.sql            -> skema database + keamanan (jalankan sekali di Supabase)
.github/workflows/      -> deploy otomatis ke GitHub Pages setiap push
```

## Setup (sekali saja)
1. **Supabase** (https://supabase.com) → New project.
2. **SQL Editor** → New query → tempel isi `supabase.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: matikan **Confirm email**.
4. **Authentication → Users → Add user → Create new user**:
   email `admin@elvancell.local`, password pilihan Anda, centang **Auto Confirm User**.
   User pertama otomatis menjadi **admin**.
5. **Project Settings → API**: salin *Project URL* dan *anon/publishable key*
   ke `public/js/config.js`.
6. GitHub repo → **Settings → Pages → Source: GitHub Actions**, lalu push.

## Login
Cukup isi **username** (mis. `admin`); aplikasi otomatis menambahkan
`@elvancell.local`. Admin menambah pengguna lewat **Menu → Kelola pengguna**,
dan bisa mengubah peran (Admin / Kasir / Nonaktif).

## Menjalankan di komputer sendiri
```
npm start
```
lalu buka http://localhost:3000 (tetap memakai database Supabase yang sama).

## Update website
Ubah kode → commit → `git push`. GitHub Actions otomatis memperbarui website.
