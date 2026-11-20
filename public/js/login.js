// Jika sudah login, langsung ke aplikasi
fetch('/api/me').then((r) => { if (r.ok) location.replace('app.html'); });

const form = document.getElementById('loginForm');
const errBox = document.getElementById('loginError');
const btn = document.getElementById('loginBtn');
const pass = document.getElementById('password');

document.getElementById('togglePass').addEventListener('click', (e) => {
  const show = pass.type === 'password';
  pass.type = show ? 'text' : 'password';
  e.target.textContent = show ? 'Sembunyi' : 'Lihat';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: form.username.value, password: pass.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login gagal');
    location.replace('app.html');
  } catch (err) {
    errBox.textContent = err.message === 'Failed to fetch' ? 'Tidak bisa terhubung ke server' : err.message;
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
});
