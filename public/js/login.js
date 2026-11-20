// Jika sudah login, langsung ke aplikasi
supa.auth.getSession().then(({ data }) => { if (data.session) location.replace('app.html'); });

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
    const { error } = await supa.auth.signInWithPassword({
      email: usernameToEmail(form.username.value),
      password: pass.value,
    });
    if (error) throw error;
    location.replace('app.html');
  } catch (err) {
    errBox.textContent = supaError(err);
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk';
  }
});
