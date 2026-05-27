const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
  ? 'https://localhost:3001'
  : '';

// ─── Referencias DOM ──────────────────────────────────────────────────────────
const loginForm        = document.getElementById('loginForm');
const registerForm     = document.getElementById('registerForm');
const forgotForm       = document.getElementById('forgotForm');
const loginSection     = document.getElementById('loginSection');
const registerSection  = document.getElementById('registerSection');
const forgotSection    = document.getElementById('forgotSection');
const messageDiv       = document.getElementById('message');
const messageRegDiv    = document.getElementById('messageReg');
const messageForgotDiv = document.getElementById('messageForgot');

// ─── Utilidades ───────────────────────────────────────────────────────────────
function showMessage(msg, isError = true, registro = false) {
  const div = registro ? messageRegDiv : messageDiv;
  if (!div) return;
  div.textContent = msg;
  div.className = isError ? 'error' : 'exito';
}

function showForgotMessage(msg, isError = true) {
  if (!messageForgotDiv) return;
  messageForgotDiv.textContent = msg;
  messageForgotDiv.className = isError ? 'error' : 'exito';
}

function limpiarMensajes() {
  if (messageDiv)       { messageDiv.textContent = '';       messageDiv.className = ''; }
  if (messageRegDiv)    { messageRegDiv.textContent = '';    messageRegDiv.className = ''; }
  if (messageForgotDiv) { messageForgotDiv.textContent = ''; messageForgotDiv.className = ''; }
}

// ─── Alternar formularios ─────────────────────────────────────────────────────
document.getElementById('showRegisterBtn')?.addEventListener('click', () => {
  loginSection.classList.add('hidden');
  registerSection.classList.remove('hidden');
  limpiarMensajes();
});

document.getElementById('showLoginBtn')?.addEventListener('click', () => {
  registerSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
  limpiarMensajes();
});

document.getElementById('showForgotBtn')?.addEventListener('click', () => {
  loginSection.classList.add('hidden');
  forgotSection.classList.remove('hidden');
  limpiarMensajes();
});

document.getElementById('showLoginFromForgot')?.addEventListener('click', () => {
  forgotSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
  limpiarMensajes();
});

// ─── Mostrar/ocultar contraseña ───────────────────────────────────────────────
function setupTogglePassword(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const btn = input.parentElement?.querySelector('.toggle-password');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.querySelector('.eye-show').classList.toggle('hidden', show);
    btn.querySelector('.eye-hide').classList.toggle('hidden', !show);
    btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

setupTogglePassword('password');
setupTogglePassword('passwordReg');
setupTogglePassword('confirmPasswordReg');

// ─── Validaciones ─────────────────────────────────────────────────────────────
const nameRegex     = /^[A-Za-záéíóúÁÉÍÓÚñÑ\s]+$/;
const phoneRegex    = /^\+?[\d\s\-]{6,20}$/;
const usernameRegex = /^[A-Za-z0-9_]+$/;
const emailRegex    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[\]{};:'",.<>/?\\|`~]).{8,16}$/;

// ─── Olvidé contraseña ────────────────────────────────────────────────────────
forgotForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarMensajes();

  const email = document.getElementById('forgotEmail').value.trim();
  if (!emailRegex.test(email)) {
    showForgotMessage('El email no es válido.');
    return;
  }

  const btn = forgotForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    await fetch(`${API_BASE_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    showForgotMessage('Si el email está registrado, recibirás un link en breve.', false);
    forgotForm.reset();
  } catch {
    showForgotMessage('Error conectando con el servidor.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar link';
  }
});

// ─── Registro ─────────────────────────────────────────────────────────────────
registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarMensajes();

  const firstName       = document.getElementById('firstNameReg').value.trim();
  const lastName        = document.getElementById('lastNameReg').value.trim();
  const phone           = document.getElementById('phoneReg').value.trim();
  const email           = document.getElementById('emailReg').value.trim();
  const username        = document.getElementById('usernameReg').value.trim();
  const password        = document.getElementById('passwordReg').value;
  const confirmPassword = document.getElementById('confirmPasswordReg').value;

  if (!firstName || !lastName || !phone || !email || !username || !password || !confirmPassword) {
    showMessage('Por favor completá todos los campos.', true, true);
    return;
  }
  if (!nameRegex.test(firstName)) {
    showMessage('El nombre solo puede contener letras y espacios.', true, true);
    return;
  }
  if (!nameRegex.test(lastName)) {
    showMessage('El apellido solo puede contener letras y espacios.', true, true);
    return;
  }
  if (!phoneRegex.test(phone)) {
    showMessage('Teléfono inválido.', true, true);
    return;
  }
  if (!emailRegex.test(email)) {
    showMessage('El email no es válido.', true, true);
    return;
  }
  if (!usernameRegex.test(username)) {
    showMessage('El usuario solo puede tener letras, números y guión bajo.', true, true);
    return;
  }
  if (!passwordRegex.test(password)) {
    showMessage('La contraseña debe tener 8-16 caracteres, una mayúscula, un número y un símbolo.', true, true);
    return;
  }
  if (password !== confirmPassword) {
    showMessage('Las contraseñas no coinciden.', true, true);
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, phone, email, username, password, role: 'professional' })
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.message || 'Error en el registro.', true, true);
      return;
    }

    showMessage('¡Cuenta creada! Ahora iniciá sesión.', false, true);
    registerForm.reset();
    setTimeout(() => {
      registerSection.classList.add('hidden');
      loginSection.classList.remove('hidden');
      limpiarMensajes();
    }, 1500);

  } catch (error) {
    showMessage('Error conectando con el servidor.', true, true);
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarMensajes();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showMessage('Ingresá usuario y contraseña.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showMessage(data.message || 'Error en el login.');
      return;
    }

    const payload = JSON.parse(atob(data.token.split('.')[1]));

    sessionStorage.setItem('token',    data.token);
    sessionStorage.setItem('userId',   payload.id);
    sessionStorage.setItem('role',     payload.role);
    sessionStorage.setItem('username', payload.username);
    sessionStorage.setItem('nombre',   `${payload.firstName} ${payload.lastName}`);
    localStorage.setItem('prof_token', data.token);

    window.location.href = '/pages/profesional.html';

  } catch (error) {
    showMessage('Error conectando con el servidor.');
  }
});
