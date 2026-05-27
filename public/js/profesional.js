const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
  ? 'https://localhost:3001' : '';

// ── Verificar sesión ──────────────────────────────────────────────────────────
const token  = sessionStorage.getItem('token');
const role   = sessionStorage.getItem('role');
const nombre = sessionStorage.getItem('nombre');

if (!token || role !== 'professional') {
  window.location.href = '/';
}

document.getElementById('nombre-display').textContent = nombre || 'Profesional';

// ── Estado global ─────────────────────────────────────────────────────────────
let pacienteActual = null;

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, tipo = 'exito') {
  const el = document.getElementById('mensaje-global');
  el.textContent = msg;
  el.className = tipo;
  setTimeout(() => { el.className = ''; }, 3500);
}

// ── Logout ────────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
  sessionStorage.clear();
  localStorage.removeItem('prof_token');
  window.location.href = '/';
});

// ── Verificar si viene de un QR (token en la URL) ─────────────────────────────
const params  = new URLSearchParams(window.location.search);
const qrToken = params.get('qr');

if (qrToken) {
  accederPorQR(qrToken);
}

async function accederPorQR(qrToken) {
  const endpoint = `${API_BASE_URL}/qr/acceder/${qrToken}`;
  console.log('[QR] ══════════════════════════════════════');
  console.log('[QR] API_BASE_URL:', JSON.stringify(API_BASE_URL));
  console.log('[QR] window.location.hostname:', window.location.hostname);
  console.log('[QR] window.location.href:', window.location.href);
  console.log('[QR] Token que se va a validar:', qrToken);
  console.log('[QR] Endpoint completo de la request:', endpoint);
  console.log('[QR] Token de sesión (JWT) presente:', !!token);
  try {
    console.log('[QR] → Haciendo fetch a:', endpoint);
    const res = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('[QR] ← Status HTTP recibido:', res.status, res.statusText);
    console.log('[QR] ← URL efectiva de la respuesta:', res.url);

    // Leer el cuerpo una sola vez y loguearlo completo
    const rawText = await res.text();
    console.log('[QR] ← Respuesta completa (texto):', rawText);

    let data;
    try { data = JSON.parse(rawText); } catch { data = { message: rawText }; }
    console.log('[QR] ← Respuesta parseada:', data);

    if (res.status === 410) {
      toast('QR vencido. Pedile al paciente que genere uno nuevo.', 'error');
      return;
    }

    if (!res.ok) {
      toast(data.message || 'QR inválido', 'error');
      return;
    }

    console.log('[QR] Acceso exitoso, paciente:', data.paciente?.firstName, data.paciente?.lastName);
    cargarVistaPaciente(data.paciente, data.historial);

  } catch (err) {
    console.error('[QR] Error de red:', err);
    toast('Error al acceder con el QR', 'error');
  }
}

// ── Cargar vista del paciente ─────────────────────────────────────────────────
function cargarVistaPaciente(paciente, historial) {
  pacienteActual = paciente;

  const iniciales = `${paciente.firstName[0]}${paciente.lastName[0]}`.toUpperCase();
  document.getElementById('paciente-avatar').textContent = iniciales;
  document.getElementById('paciente-nombre').textContent = `${paciente.firstName} ${paciente.lastName}`;
  document.getElementById('paciente-meta').textContent   = `${paciente.email} · ${paciente.phone || 'Sin teléfono'}`;

  document.getElementById('estado-vacio').classList.add('hidden');
  document.getElementById('vista-paciente').classList.remove('hidden');

  renderHistorial(historial);
}

// ── Renderizar historial ──────────────────────────────────────────────────────
const tipoLabels = {
  diagnostico: 'Diagnóstico',
  medicacion:  'Medicación',
  alergia:     'Alergia',
  cirugia:     'Cirugía',
  vacuna:      'Vacuna',
  estudio:     'Estudio',
  nota:        'Nota'
};

function renderArchivo(item) {
  if (!item.archivo_path) return '';
  const fileUrl = `${API_BASE_URL}/archivo/${item.archivo_path}?token=${encodeURIComponent(token)}`;
  const isImage = item.archivo_tipo && item.archivo_tipo.startsWith('image/');
  const isVideo = item.archivo_tipo && item.archivo_tipo.startsWith('video/');

  if (isImage) {
    return `<div class="historial-archivo">
      <a href="${fileUrl}" target="_blank" rel="noopener">
        <img src="${fileUrl}" alt="${item.archivo_nombre}" class="historial-archivo-img" loading="lazy" />
      </a>
      <div class="historial-archivo-nombre">${item.archivo_nombre}</div>
    </div>`;
  }
  if (isVideo) {
    return `<div class="historial-archivo">
      <video controls class="historial-archivo-video" preload="metadata">
        <source src="${fileUrl}" type="${item.archivo_tipo}" />
        Tu navegador no soporta la reproducción de video.
      </video>
      <div class="historial-archivo-nombre">${item.archivo_nombre}</div>
    </div>`;
  }
  return `<div class="historial-archivo">
    <a href="${fileUrl}" target="_blank" rel="noopener" class="historial-archivo-link" download="${item.archivo_nombre}">
      📎 ${item.archivo_nombre}
    </a>
  </div>`;
}

function renderHistorial(historial) {
  const container = document.getElementById('historial-container');
  const badge     = document.getElementById('badge-count');
  badge.textContent = `${historial.length} registro${historial.length !== 1 ? 's' : ''}`;

  if (!historial.length) {
    container.innerHTML = '<div class="historial-vacio">No hay registros médicos todavía. Usá el botón "Agregar registro" para cargar el primero.</div>';
    return;
  }

  container.innerHTML = `<div class="historial-lista">
    ${historial.map(item => `
      <div class="historial-item">
        <span class="tipo-badge tipo-${item.tipo}">${tipoLabels[item.tipo] || item.tipo}</span>
        <div class="historial-item-body">
          <div class="historial-item-titulo">${item.titulo}</div>
          ${item.descripcion ? `<div class="historial-item-desc">${item.descripcion}</div>` : ''}
          ${renderArchivo(item)}
          <div class="historial-item-meta">
            ${item.fecha_registro ? `Fecha: ${item.fecha_registro} · ` : ''}
            Registrado el ${new Date(item.created_at).toLocaleDateString('es-AR')}
            · Por ${item.prof_nombre} ${item.prof_apellido}
          </div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

// ── Escáner QR ────────────────────────────────────────────────────────────────
let qrScanner = null;
let qrEscaneando = false;

function extractTokenFromQR(texto) {
  console.log('[QR] Texto escaneado:', texto);
  try {
    const url = new URL(texto);
    const tokenParam = url.searchParams.get('token');
    if (tokenParam) {
      console.log('[QR] Token extraído de ?token=', tokenParam);
      return tokenParam;
    }
    // Fallback: si el token viene en el path (formato alternativo)
    const partes = url.pathname.split('/').filter(Boolean);
    const pathToken = partes[partes.length - 1] || null;
    console.log('[QR] Token extraído del path:', pathToken);
    return pathToken;
  } catch {
    const t = texto.trim();
    console.log('[QR] QR no es URL, usando texto directo:', t);
    return t.length > 0 ? t : null;
  }
}

async function cerrarEscaner() {
  document.getElementById('modal-qr-overlay').classList.add('hidden');
  if (qrScanner) {
    try {
      if (qrScanner.isScanning) await qrScanner.stop();
    } catch (_) {}
    qrScanner = null;
  }
  qrEscaneando = false;
}

function abrirEscaner() {
  if (qrEscaneando) return;
  document.getElementById('qr-reader').innerHTML = '';
  document.getElementById('modal-qr-overlay').classList.remove('hidden');

  qrScanner = new Html5Qrcode('qr-reader');
  qrEscaneando = true;

  qrScanner.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: (w, h) => {
        const size = Math.floor(Math.min(w, h) * 0.7);
        return { width: size, height: size };
      }
    },
    async (decodedText) => {
      console.log('[QR SCAN] ══════════════════════════════════════');
      console.log('[QR SCAN] Texto recibido del escáner:', decodedText);
      if (!qrEscaneando) return;
      qrEscaneando = false;
      await cerrarEscaner();
      const qrToken = extractTokenFromQR(decodedText);
      console.log('[QR SCAN] Token final a enviar al servidor:', qrToken);
      if (!qrToken) {
        toast('QR inválido', 'error');
        return;
      }
      accederPorQR(qrToken);
    },
    () => {}
  ).catch(() => {
    toast('No se pudo acceder a la cámara. Verificá los permisos del navegador.', 'error');
    cerrarEscaner();
  });
}

document.getElementById('btn-escanear-qr').addEventListener('click', abrirEscaner);
document.getElementById('btn-cancelar-qr').addEventListener('click', cerrarEscaner);
document.getElementById('modal-qr-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-qr-overlay')) cerrarEscaner();
});

// ── Modal nuevo registro ──────────────────────────────────────────────────────
function cerrarModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('form-registro').reset();
  document.getElementById('archivo-preview').classList.add('hidden');
  document.getElementById('archivo-preview').innerHTML = '';
}

document.getElementById('btn-nuevo-registro').addEventListener('click', () => {
  if (!pacienteActual) return;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('fecha-registro').value = new Date().toISOString().split('T')[0];
});

document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) cerrarModal();
});

// Previsualización del archivo seleccionado
document.getElementById('archivo').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const preview = document.getElementById('archivo-preview');
  if (!file) {
    preview.classList.add('hidden');
    preview.innerHTML = '';
    return;
  }
  const url = URL.createObjectURL(file);
  if (file.type.startsWith('image/')) {
    preview.innerHTML = `<img src="${url}" alt="preview" class="archivo-preview-img" />`;
  } else if (file.type.startsWith('video/')) {
    preview.innerHTML = `<video src="${url}" class="archivo-preview-video" controls muted preload="metadata"></video>`;
  } else {
    preview.innerHTML = `<span class="archivo-preview-nombre">📎 ${file.name}</span>`;
  }
  preview.classList.remove('hidden');
});

// ── Perfil ────────────────────────────────────────────────────────────────────
let perfilData = {};

async function cargarPerfil() {
  try {
    const res = await fetch(`${API_BASE_URL}/perfil`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    perfilData = await res.json();
    actualizarFotoUI(perfilData.foto_path);
  } catch (_) {}
}

function iniciales() {
  return (nombre || 'P').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function actualizarFotoUI(fotaPath) {
  const navbarAvatar  = document.getElementById('navbar-avatar');
  const modalIniciales = document.getElementById('perfil-foto-iniciales');
  const modalImg       = document.getElementById('perfil-foto-img');

  if (fotaPath) {
    const url = `${API_BASE_URL}/archivo/${fotaPath}?token=${encodeURIComponent(token)}`;
    navbarAvatar.innerHTML = `<img src="${url}" alt="foto" />`;
    modalIniciales.classList.add('hidden');
    modalImg.src = url;
    modalImg.classList.remove('hidden');
  } else {
    const ini = iniciales();
    navbarAvatar.textContent = ini;
    modalIniciales.textContent = ini;
    modalIniciales.classList.remove('hidden');
    modalImg.classList.add('hidden');
  }
}

function abrirModalPerfil() {
  document.getElementById('perfil-especialidad').value = perfilData.especialidad || '';
  document.getElementById('perfil-matricula').value    = perfilData.matricula    || '';
  document.getElementById('perfil-institucion').value  = perfilData.institucion  || '';
  document.getElementById('modal-perfil-overlay').classList.remove('hidden');
}

function cerrarModalPerfil() {
  document.getElementById('modal-perfil-overlay').classList.add('hidden');
}

document.getElementById('btn-perfil').addEventListener('click', abrirModalPerfil);
document.getElementById('btn-cancelar-perfil').addEventListener('click', cerrarModalPerfil);
document.getElementById('modal-perfil-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-perfil-overlay')) cerrarModalPerfil();
});

document.getElementById('input-foto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('foto', file);
  try {
    const res = await fetch(`${API_BASE_URL}/perfil/foto`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) { toast(data.message || 'Error al subir la foto', 'error'); return; }
    perfilData.foto_path = data.foto_path;
    actualizarFotoUI(data.foto_path);
    toast('Foto de perfil actualizada');
  } catch (_) {
    toast('Error al subir la foto', 'error');
  }
  e.target.value = '';
});

document.getElementById('form-perfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-guardar-perfil');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  const body = {
    especialidad: document.getElementById('perfil-especialidad').value.trim(),
    matricula:    document.getElementById('perfil-matricula').value.trim(),
    institucion:  document.getElementById('perfil-institucion').value.trim()
  };
  try {
    const res = await fetch(`${API_BASE_URL}/perfil`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) { toast(data.message || 'Error al guardar el perfil', 'error'); return; }
    perfilData = { ...perfilData, ...body };
    cerrarModalPerfil();
    toast('Perfil guardado correctamente');
  } catch (_) {
    toast('Error conectando con el servidor', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar perfil';
  }
});

cargarPerfil();

// ── Guardar registro ──────────────────────────────────────────────────────────
document.getElementById('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('btn-guardar');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const tipo          = document.getElementById('tipo').value;
  const titulo        = document.getElementById('titulo').value.trim();
  const descripcion   = document.getElementById('descripcion').value.trim();
  const fechaRegistro = document.getElementById('fecha-registro').value;
  const archivoInput  = document.getElementById('archivo');

  const formData = new FormData();
  formData.append('tipo', tipo);
  formData.append('titulo', titulo);
  formData.append('descripcion', descripcion);
  formData.append('fecha_registro', fechaRegistro);
  if (archivoInput.files[0]) {
    formData.append('archivo', archivoInput.files[0]);
  }

  try {
    const res = await fetch(`${API_BASE_URL}/historial/paciente/${pacienteActual.id}/registro`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      const data = await res.json();
      toast(data.message || 'Error al guardar', 'error');
      return;
    }

    const data = await res.json();
    cerrarModal();
    toast('Registro guardado correctamente');
    renderHistorial(data.historial);

  } catch (err) {
    toast('Error conectando con el servidor', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar registro';
  }
});
