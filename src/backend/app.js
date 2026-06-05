import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { openDb, initDb } from './database.js';
import pacienteRouter from './routes/paciente.js';
import { UPLOADS_DIR } from './upload.js';
import { upload } from './upload.js';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const passwordResetRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]).{8,16}$/;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token requerido' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Token inválido' });
    req.user = user;
    next();
  });
}

function requireAdminToken(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_API_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ─── Rutas públicas ───────────────────────────────────────────────────────────

app.post('/register', async (req, res) => {
  const { first_name, last_name, phone, email, username, password, role } = req.body;

  if (!first_name || !last_name || !email || !username || !password || !role) {
    return res.status(400).json({ message: 'Faltan datos obligatorios' });
  }

  if (role !== 'professional') {
    return res.status(400).json({ message: 'Solo se permiten cuentas de profesional en esta plataforma' });
  }

  try {
    const db = await openDb();
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.run(
      `INSERT INTO users (first_name, last_name, phone, email, username, password, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, phone, email, username, hashedPassword, role]
    );

    res.status(201).json({ message: 'Cuenta de profesional registrada correctamente' });
  } catch (error) {
    console.error('Error en /register:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ message: 'El usuario o email ya existe' });
    } else {
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Usuario y contraseña requeridos' });
  }

  try {
    const db = await openDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', username);

    if (!user) {
      return res.status(400).json({ message: 'Usuario no encontrado' });
    }

    if (user.role !== 'professional') {
      return res.status(403).json({ message: 'Esta plataforma es solo para profesionales de salud' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role
    });
  } catch (error) {
    console.error('Error en /login:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// ─── Recuperación de contraseña ───────────────────────────────────────────────

app.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requerido' });

  // Siempre responder igual para no revelar si el email existe
  res.json({ message: 'Si el email está registrado, recibirás un link en breve.' });

  try {
    const db = await openDb();
    const user = await db.get(
      "SELECT id FROM users WHERE email = ? AND role = 'professional'",
      email
    );
    if (!user) return;

    // Invalidar tokens anteriores del mismo usuario
    await db.run(
      'UPDATE password_reset_tokens SET used = 1 WHERE user_id = ?',
      user.id
    );

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString();

    await db.run(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt]
    );

    const appUrl = process.env.APP_URL || `https://localhost:${PORT}`;
    const resetUrl = `${appUrl}/pages/reset-password.html?token=${token}`;

    await transporter.sendMail({
      from: `"Medic Professionals" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Restablecer contraseña — Medic Professionals',
      charset: 'utf-8',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
          <h2 style="color:#16A34A;margin-bottom:1rem;">Restablecer contraseña</h2>
          <p style="color:#374151;line-height:1.6;margin-bottom:1.5rem;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta en Medic Professionals.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#16A34A;color:white;text-decoration:none;padding:0.75rem 1.5rem;border-radius:10px;font-weight:500;margin-bottom:1.5rem;">
            Restablecer contraseña
          </a>
          <p style="color:#6B7280;font-size:0.85rem;line-height:1.6;">
            Este link expira en 1 hora. Si no solicitaste esto, podés ignorar este email.
          </p>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:1.5rem 0;" />
          <p style="color:#9CA3AF;font-size:0.78rem;">
            Si el botón no funciona, copiá este link:<br/>${resetUrl}
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[forgot-password]', err.message);
  }
});

app.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: 'Token y contraseña requeridos' });
  }
  if (!passwordResetRegex.test(password)) {
    return res.status(400).json({
      message: 'La contraseña debe tener 8-16 caracteres, una mayúscula, un número y un símbolo.',
    });
  }

  try {
    const db = await openDb();
    const record = await db.get(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0',
      token
    );

    if (!record || new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ message: 'El link expiró o ya fue utilizado.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', [hashed, record.user_id]);
    await db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', record.id);

    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('Error en /reset-password:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// ─── Rutas protegidas ─────────────────────────────────────────────────────────

// Perfil profesional
app.get('/perfil', authenticateToken, async (req, res) => {
  try {
    const db = await openDb();
    const perfil = await db.get(
      'SELECT especialidad, matricula, institucion, foto_path FROM professional_profiles WHERE user_id = ?',
      req.user.id
    );
    res.json(perfil || {});
  } catch (err) {
    console.error('Error en GET /perfil:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

app.put('/perfil', authenticateToken, async (req, res) => {
  const { especialidad, matricula, institucion } = req.body;
  try {
    const db = await openDb();
    const existing = await db.get(
      'SELECT id FROM professional_profiles WHERE user_id = ?', req.user.id
    );
    if (existing) {
      await db.run(
        'UPDATE professional_profiles SET especialidad = ?, matricula = ?, institucion = ? WHERE user_id = ?',
        [especialidad || null, matricula || null, institucion || null, req.user.id]
      );
    } else {
      await db.run(
        'INSERT INTO professional_profiles (user_id, especialidad, matricula, institucion) VALUES (?, ?, ?, ?)',
        [req.user.id, especialidad || null, matricula || null, institucion || null]
      );
    }
    res.json({ message: 'Perfil actualizado' });
  } catch (err) {
    console.error('Error en PUT /perfil:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

app.post('/perfil/foto', authenticateToken, (req, res, next) => {
  upload.single('foto')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna foto' });
  if (!req.file.mimetype.startsWith('image/')) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'Solo se permiten imágenes para la foto de perfil' });
  }
  try {
    const db = await openDb();
    const existing = await db.get(
      'SELECT foto_path FROM professional_profiles WHERE user_id = ?', req.user.id
    );
    if (existing?.foto_path) {
      const oldPath = path.join(UPLOADS_DIR, existing.foto_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    if (existing) {
      await db.run(
        'UPDATE professional_profiles SET foto_path = ? WHERE user_id = ?',
        [req.file.filename, req.user.id]
      );
    } else {
      await db.run(
        'INSERT INTO professional_profiles (user_id, foto_path) VALUES (?, ?)',
        [req.user.id, req.file.filename]
      );
    }
    res.json({ message: 'Foto actualizada', foto_path: req.file.filename });
  } catch (err) {
    console.error('Error en POST /perfil/foto:', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

app.use('/historial/paciente', authenticateToken, pacienteRouter);

app.get('/archivo/:filename', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;
  if (!token) return res.status(401).json({ message: 'Token requerido' });

  jwt.verify(token, JWT_SECRET, (err) => {
    if (err) return res.status(403).json({ message: 'Token inválido' });
    const filename = path.basename(req.params.filename);
    res.sendFile(path.join(UPLOADS_DIR, filename), (sendErr) => {
      if (sendErr) res.status(404).json({ message: 'Archivo no encontrado' });
    });
  });
});

app.get('/qr/acceder/:token', authenticateToken, async (req, res) => {
  if (req.user.role !== 'professional') {
    return res.status(403).json({ message: 'Solo profesionales pueden escanear QR' });
  }

  const medicDataUrl = process.env.MEDICDATA_URL;
  if (!medicDataUrl) {
    console.error('[QR BACKEND] MEDICDATA_URL no está configurado');
    return res.status(500).json({ message: 'Error de configuración del servidor' });
  }

  try {
    const response = await fetch(
      `${medicDataUrl}/qr/acceder/${req.params.token}`,
      { headers: { Authorization: req.headers['authorization'] } }
    );
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('[QR BACKEND] Error consultando MedicData:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// ─── Rutas admin ─────────────────────────────────────────────────────────────

app.get('/api/admin/users', requireAdminToken, async (req, res) => {
  try {
    const db = await openDb();
    const users = await db.all(`
      SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.username, u.role, u.created_at,
             u.matricula, u.institucion
      FROM users u
      ORDER BY u.created_at DESC
    `);
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users/:id', requireAdminToken, async (req, res) => {
  try {
    const db = await openDb();
    const user = await db.get(`
      SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.username, u.role, u.created_at,
             u.matricula, u.institucion
      FROM users u WHERE u.id = ?
    `, req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(user);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/users/:id', requireAdminToken, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, username, matricula, institucion } = req.body;
    const db = await openDb();
    const result = await db.run(
      'UPDATE users SET first_name=?, last_name=?, email=?, phone=?, username=?, matricula=?, institucion=? WHERE id=?',
      [first_name, last_name, email, phone ?? null, username, matricula ?? null, institucion ?? null, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/users/:id', requireAdminToken, async (req, res) => {
  try {
    const db = await openDb();
    const result = await db.run('DELETE FROM users WHERE id=?', req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── Inicializar DB y arrancar servidor ───────────────────────────────────────
const CERT_KEY  = path.join(__dirname, '../../certs/localhost-key.pem');
const CERT_FILE = path.join(__dirname, '../../certs/localhost.pem');

function startServer(server, label) {
  let retries = 0;

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries < 5) {
      retries++;
      console.log(`[${label}] Puerto ${PORT} ocupado, reintentando (${retries}/5)...`);
      setTimeout(() => server.listen(PORT, '0.0.0.0'), 1000);
    } else {
      console.error(`[${label}] Error al iniciar el servidor:`, err.message);
      process.exit(1);
    }
  });

  // Liberar el puerto limpiamente cuando nodemon reinicia (SIGTERM)
  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });

  server.listen(PORT, '0.0.0.0');
}

initDb()
  .then(() => {
    if (fs.existsSync(CERT_KEY) && fs.existsSync(CERT_FILE)) {
      const sslOptions = {
        key:  fs.readFileSync(CERT_KEY),
        cert: fs.readFileSync(CERT_FILE),
      };
      const server = https.createServer(sslOptions, app);

      // Ignorar errores TLS del cliente (handshake abortado, cert no confiado en móvil)
      server.on('tlsClientError', () => {});

      server.on('listening', () => {
        console.log(`[HTTPS] Medic Professionals → https://localhost:${PORT}`);
        console.log(`[HTTPS] Red local           → https://192.168.1.64:${PORT}`);
      });

      startServer(server, 'HTTPS');
    } else {
      const server = app.listen(PORT, '0.0.0.0');
      server.on('listening', () => {
        console.log(`[HTTP]  Medic Professionals → http://localhost:${PORT}`);
        console.log(`        Para habilitar HTTPS ejecutá: npm run setup:certs`);
      });
      server.on('error', (err) => {
        console.error('[HTTP] Error al iniciar el servidor:', err.message);
        process.exit(1);
      });
    }
  })
  .catch(err => {
    console.error('Error inicializando la base de datos:', err);
    process.exit(1);
  });
