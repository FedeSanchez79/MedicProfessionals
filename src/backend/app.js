import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
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

// ─── Rutas públicas ───────────────────────────────────────────────────────────

app.post('/register', async (req, res) => {
  const { firstName, lastName, phone, email, username, password, role } = req.body;

  if (!firstName || !lastName || !email || !username || !password || !role) {
    return res.status(400).json({ message: 'Faltan datos obligatorios' });
  }

  if (role !== 'professional') {
    return res.status(400).json({ message: 'Solo se permiten cuentas de profesional en esta plataforma' });
  }

  try {
    const db = await openDb();
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.run(
      `INSERT INTO users (firstName, lastName, phone, email, username, password, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [firstName, lastName, phone, email, username, hashedPassword, role]
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
        firstName: user.firstName,
        lastName: user.lastName
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role
    });
  } catch (error) {
    console.error('Error en /login:', error);
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

  try {
    const db = await openDb();
    const qr = await db.get(
      `SELECT * FROM qr_tokens WHERE token = ? AND used = 0`,
      req.params.token
    );

    if (!qr) {
      return res.status(404).json({ message: 'QR inválido o ya utilizado' });
    }

    if (new Date() > new Date(qr.expires_at)) {
      await db.run(`UPDATE qr_tokens SET used = 1 WHERE id = ?`, qr.id);
      return res.status(410).json({ message: 'El QR expiró. El paciente debe generar uno nuevo.' });
    }

    await db.run(
      `INSERT INTO access_log (patient_id, accessed_by, metodo) VALUES (?, ?, 'qr')`,
      [qr.patient_id, req.user.id]
    );

    const paciente = await db.get(
      `SELECT id, firstName, lastName, email, phone FROM users WHERE id = ?`,
      qr.patient_id
    );

    const historial = await db.all(
      `SELECT mr.*, u.firstName as prof_nombre, u.lastName as prof_apellido
       FROM medical_records mr
       JOIN users u ON u.id = mr.professional_id
       WHERE mr.patient_id = ? AND mr.activo = 1
       ORDER BY mr.created_at DESC`,
      qr.patient_id
    );

    res.json({ paciente, historial });
  } catch (error) {
    console.error('Error accediendo por QR:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
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
