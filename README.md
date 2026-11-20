# ELVAN CELL — Sistem Rekap Transaksi & Kas Harian

Frontend: HTML + CSS (media query, responsif) + JavaScript
Backend : Node.js + Express
Database: libSQL/SQLite — online di Turso, lokal di file `data/elvan-cell.db`

## Akun bawaan
| Peran | Username | Password |
|-------|----------|----------|
| Admin | `admin`  | `Elvan@2026` |
| Kasir | `kasir`  | `Kasir@2026` |

> Segera ganti password lewat **Menu → Ganti password** setelah login pertama.
> Admin bisa menambah/menghapus pengguna lewat **Menu → Kelola pengguna**.

## Online gratis: Render + Turso
- Server : Render (paket Free, dari repo GitHub, pakai `render.yaml`)
- Database: Turso (paket Free)
- Variabel lingkungan di Render: `TURSO_DATABASE_URL` (libsql://...) dan
  `TURSO_AUTH_TOKEN`. Tanpa variabel ini, data memakai file lokal dan
  akan HILANG saat Render restart.
- Paket Free Render "tidur" setelah 15 menit tanpa pengunjung; saat dibuka
  lagi perlu menunggu ±1 menit.

Update website setelah mengubah kode: commit lalu `git push`. Render otomatis
men-deploy ulang.

## Cara menjalankan di komputer sendiri
1. Install Node.js (versi 18 ke atas) dari https://nodejs.org
2. Buka terminal di folder ini, lalu jalankan:
   ```
   npm install
   npm start
   ```
3. Buka `http://localhost:3000` di browser.

## Akses dari HP / laptop lain
- **Satu jaringan WiFi**: saat `npm start`, terminal menampilkan alamat seperti
  `http://192.168.x.x:3000`. Buka alamat itu di HP. Jika tidak bisa, izinkan
  Node.js di Windows Firewall (pilih "Private network").
- **Lewat internet (dari mana saja)**: upload folder ini ke hosting Node.js
  (misalnya Render, Railway, atau VPS). Gunakan perintah start `npm start`.
  Database SQLite perlu disk permanen (persistent disk / volume); atur
  variabel `DATA_DIR` ke lokasi disk tersebut.

## Fitur
- Login dengan sesi aman (password di-hash, cookie HttpOnly)
- Saldo awal harian, statistik, perkiraan kas & saldo digital akhir
- Rekening/dompet + mutasi (masuk, keluar, transfer antar rekening)
- Catat transaksi + tombol "Isi otomatis" arus uang
- Unduh rekap: **Gambar (PNG)**, **Excel (.xlsx)**, **Word (.doc)**, atau cetak
- Backup & import data (admin)
- Data tersinkron antar perangkat (otomatis refresh tiap 20 detik)

## Struktur
```
server.js        -> backend / API
db.js            -> skema database + akun bawaan
public/
  login.html     -> halaman login
  app.html       -> halaman utama
  css/style.css  -> tampilan + media query
  js/login.js
  js/app.js      -> logika frontend + ekspor rekap
data/            -> file database (jangan dihapus; backup rutin)
```
