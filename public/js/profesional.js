const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3001' : '';

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
  window.location.href = '/';
});

// ── Verificar si viene de un QR (token en la URL) ─────────────────────────────
const params  = new URLSearchParams(window.location.search);
const qrToken = params.get('qr');

if (qrToken) {
  accederPorQR(qrToken);
}

async function accederPorQR(qrToken) {
  try {
    const res = await fetch(`${API_BASE_URL}/qr/acceder/${qrToken}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const data = await res.json();
      toast(data.message || 'QR inválido o expirado', 'error');
      return;
    }

    const data = await res.json();
    cargarVistaPaciente(data.paciente, data.historial);

  } catch (err) {
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
