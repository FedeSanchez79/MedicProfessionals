import express from 'express';
import path from 'path';
import fs from 'fs';
import { openDb } from '../database.js';
import { upload, UPLOADS_DIR } from '../upload.js';

const router = express.Router();

// GET /perfil — datos del profesional autenticado
router.get('/', async (req, res) => {
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

// PUT /perfil — actualizar datos del perfil
router.put('/', async (req, res) => {
  const { especialidad, matricula, institucion } = req.body;
  try {
    const db = await openDb();
    const existing = await db.get(
      'SELECT id FROM professional_profiles WHERE user_id = ?',
      req.user.id
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

// POST /perfil/foto — subir/cambiar foto de perfil
router.post('/foto', (req, res, next) => {
  upload.single('foto')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No se recibió ninguna foto' });
  }
  if (!req.file.mimetype.startsWith('image/')) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'Solo se permiten imágenes para la foto de perfil' });
  }
  try {
    const db = await openDb();
    const existing = await db.get(
      'SELECT foto_path FROM professional_profiles WHERE user_id = ?',
      req.user.id
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

export default router;
