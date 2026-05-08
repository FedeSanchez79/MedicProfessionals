import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { openDb, initDb } from './database.js';
import pacienteRouter from './routes/paciente.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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

app.use('/historial/paciente', authenticateToken, pacienteRouter);

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
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Medic Professionals corriendo en http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Error inicializando la base de datos:', err);
    process.exit(1);
  });
