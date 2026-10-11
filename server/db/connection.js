import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DB_PATH } from '../config.js';
import { runMigrations } from './migrations.js';

let sharedDatabase = null;

// Creates (or opens) a database at the given path, ensures the parent directory
// exists, applies migrations and returns a synchronous connection.
export function createDatabase(dbPath = DB_PATH) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  runMigrations(db);
  return db;
}

export function getDatabase() {
  if (!sharedDatabase) {
    sharedDatabase = createDatabase();
  }
  return sharedDatabase;
}

export function closeDatabase() {
  if (sharedDatabase) {
    sharedDatabase.close();
    sharedDatabase = null;
  }
}
