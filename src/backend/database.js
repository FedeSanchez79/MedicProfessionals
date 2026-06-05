import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = process.env.DB_PATH || path.join(__dirname, '../../database/medicprofessionals.db');

export async function openDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

  return open({
    filename: DB_FILE,
    driver: sqlite3.Database
  });
}

export async function initDb() {
  const db = await openDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id        TEXT    UNIQUE,
      username         TEXT    UNIQUE,
      password         TEXT,
      role             TEXT    NOT NULL CHECK(role IN ('patient', 'professional')),
      first_name       TEXT    NOT NULL,
      last_name        TEXT    NOT NULL,
      email            TEXT    UNIQUE NOT NULL,
      phone            TEXT,
      dni              TEXT,
      matricula        TEXT,
      institucion      TEXT,
      fecha_nacimiento DATE,
      cobertura_medica TEXT,
      numero_afiliado  TEXT,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migración: agregar google_id y hacer username/password nullable en DBs existentes
  const cols = await db.all("PRAGMA table_info(users)");
  const hasGoogleId = cols.some(c => c.name === 'google_id');

  if (!hasGoogleId) {
    await db.run('BEGIN');
    try {
      await db.run('ALTER TABLE users RENAME TO users_old');
      await db.exec(`
        CREATE TABLE users (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          google_id        TEXT    UNIQUE,
          username         TEXT    UNIQUE,
          password         TEXT,
          role             TEXT    NOT NULL CHECK(role IN ('patient', 'professional')),
          first_name       TEXT    NOT NULL,
          last_name        TEXT    NOT NULL,
          email            TEXT    UNIQUE NOT NULL,
          phone            TEXT,
          dni              TEXT,
          matricula        TEXT,
          institucion      TEXT,
          fecha_nacimiento DATE,
          cobertura_medica TEXT,
          numero_afiliado  TEXT,
          created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.run(`
        INSERT INTO users (id, username, password, role, first_name, last_name, email,
                           phone, dni, matricula, institucion, fecha_nacimiento,
                           cobertura_medica, numero_afiliado, created_at)
        SELECT id, username, password, role, first_name, last_name, email,
               phone, dni, matricula, institucion, fecha_nacimiento,
               cobertura_medica, numero_afiliado, created_at
        FROM users_old
      `);
      await db.run('DROP TABLE users_old');
      await db.run('COMMIT');
    } catch (e) {
      await db.run('ROLLBACK');
      throw e;
    }
  }

  // Migración: agregar columnas faltantes en DBs existentes
  for (const col of [
    'phone TEXT',
    'dni TEXT',
    'matricula TEXT',
    'institucion TEXT',
    'fecha_nacimiento DATE',
    'cobertura_medica TEXT',
    'numero_afiliado TEXT',
    'created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
  ]) {
    try { await db.exec(`ALTER TABLE users ADD COLUMN ${col}`); } catch (_) {}
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS professional_profiles (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL UNIQUE,
      especialidad    TEXT,
      matricula       TEXT,
      institucion     TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS medical_records (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id      INTEGER NOT NULL,
      professional_id INTEGER NOT NULL,
      tipo            TEXT NOT NULL,
      titulo          TEXT NOT NULL,
      descripcion     TEXT,
      fecha_registro  DATE,
      activo          INTEGER DEFAULT 1,
      acepta_paciente INTEGER DEFAULT 0,
      archivo_path    TEXT,
      archivo_nombre  TEXT,
      archivo_tipo    TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id)      REFERENCES users(id),
      FOREIGN KEY (professional_id) REFERENCES users(id)
    );
  `);

  // Migración para bases de datos existentes
  for (const col of ['archivo_path TEXT', 'archivo_nombre TEXT', 'archivo_tipo TEXT']) {
    try { await db.exec(`ALTER TABLE medical_records ADD COLUMN ${col}`); } catch (_) {}
  }
  try { await db.exec('ALTER TABLE professional_profiles ADD COLUMN foto_path TEXT'); } catch (_) {}

  // Migración: agregar professional_id a medical_records si MedicData creó la tabla sin ella
  try { await db.exec('ALTER TABLE medical_records ADD COLUMN professional_id INTEGER'); } catch (_) {}

  await db.exec(`
    CREATE TABLE IF NOT EXISTS qr_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id  INTEGER NOT NULL,
      token       TEXT    NOT NULL UNIQUE,
      expires_at  DATETIME NOT NULL,
      used        INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES users(id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS access_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id      INTEGER NOT NULL,
      accessed_by     INTEGER NOT NULL,
      metodo          TEXT DEFAULT 'qr',
      accessed_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id)  REFERENCES users(id),
      FOREIGN KEY (accessed_by) REFERENCES users(id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      token      TEXT    NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used       INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  return db;
}
