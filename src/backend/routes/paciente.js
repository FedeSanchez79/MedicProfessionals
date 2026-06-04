import express from 'express';
import { openDb } from '../database.js';
import { upload } from '../upload.js';

const router = express.Router();

// GET /historial/paciente/:id — solo profesionales
router.get('/:id', async (req, res) => {
  const { role } = req.user;

  if (role !== 'professional') {
    return res.status(403).json({ message: 'Acceso denegado' });
  }

  try {
    const db = await openDb();

    const paciente = await db.get(
      `SELECT id, first_name, last_name, email, phone FROM users WHERE id = ? AND role = 'patient'`,
      req.params.id
    );

    if (!paciente) {
      return res.status(404).json({ message: 'Paciente no encontrado' });
    }

    const historial = await db.all(
      `SELECT mr.*, u.first_name as prof_nombre, u.last_name as prof_apellido
       FROM medical_records mr
       JOIN users u ON u.id = mr.professional_id
       WHERE mr.patient_id = ?
       ORDER BY mr.created_at DESC`,
      req.params.id
    );

    res.json({ paciente, historial });

  } catch (err) {
    console.error('Error en GET /historial/paciente/:id :', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// POST /historial/paciente/:id/registro — solo profesionales
router.post('/:id/registro', (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  const { role, id: profId } = req.user;

  if (role !== 'professional') {
    if (req.file) {
      const fs = await import('fs');
      fs.unlinkSync(req.file.path);
    }
    return res.status(403).json({ message: 'Solo profesionales pueden cargar registros' });
  }

  const { tipo, titulo, descripcion, fecha_registro } = req.body;

  if (!tipo || !titulo) {
    if (req.file) {
      const fs = await import('fs');
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ message: 'Tipo y título son obligatorios' });
  }

  const tiposValidos = ['diagnostico', 'medicacion', 'alergia', 'cirugia', 'vacuna', 'estudio', 'nota'];
  if (!tiposValidos.includes(tipo)) {
    if (req.file) {
      const fs = await import('fs');
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ message: 'Tipo de registro inválido' });
  }

  try {
    const db = await openDb();

    const paciente = await db.get(
      `SELECT id FROM users WHERE id = ? AND role = 'patient'`,
      req.params.id
    );

    if (!paciente) {
      if (req.file) {
        const fs = await import('fs');
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: 'Paciente no encontrado' });
    }

    const archivoPath   = req.file ? req.file.filename : null;
    const archivoNombre = req.file ? req.file.originalname : null;
    const archivoTipo   = req.file ? req.file.mimetype : null;

    await db.run(
      `INSERT INTO medical_records
         (patient_id, professional_id, tipo, titulo, descripcion, fecha_registro, acepta_paciente, archivo_path, archivo_nombre, archivo_tipo)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [req.params.id, profId, tipo, titulo, descripcion || null, fecha_registro || null, archivoPath, archivoNombre, archivoTipo]
    );

    await db.run(
      `INSERT INTO access_log (patient_id, accessed_by, metodo) VALUES (?, ?, 'directo')`,
      [req.params.id, profId]
    );

    const historial = await db.all(
      `SELECT mr.*, u.first_name as prof_nombre, u.last_name as prof_apellido
       FROM medical_records mr
       JOIN users u ON u.id = mr.professional_id
       WHERE mr.patient_id = ?
       ORDER BY mr.created_at DESC`,
      req.params.id
    );

    res.status(201).json({ message: 'Registro guardado', historial });

  } catch (err) {
    console.error('Error en POST /historial/paciente/:id/registro :', err);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
