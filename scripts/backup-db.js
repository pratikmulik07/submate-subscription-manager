// Creates a consistent, timestamped copy of the SQLite database.
//
// Safe to run while SubMate is serving requests: SQLite's `VACUUM INTO`
// produces a transactionally-consistent snapshot of the live database and
// writes it to a single, self-contained file (no -wal/-shm side files).
//
// Usage:
//   npm run db:backup
//
// Overrides (environment variables):
//   SUBMATE_BACKUP_DIR   target directory (default: <data dir>/backups)
//   SUBMATE_BACKUP_KEEP  how many recent backups to retain (default: 7, 0 = keep all)
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../server/config.js';

const DEFAULT_KEEP = Number(process.env.SUBMATE_BACKUP_KEEP ?? 7);

function stamp(date) {
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}`
  );
}

function pruneBackups(dir, prefix, keep) {
  if (!Number.isFinite(keep) || keep <= 0) return [];
  const files = readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sqlite'))
    .sort()
    .reverse();
  const stale = files.slice(keep);
  for (const name of stale) {
    rmSync(join(dir, name), { force: true });
  }
  return stale;
}

// Copies `dbPath` into `backupDir` and returns metadata about the result.
// Returns { created: false, reason: 'no-database' } when there is nothing to copy.
export function createBackup({
  dbPath = DB_PATH,
  backupDir,
  keep = DEFAULT_KEEP,
  now = new Date(),
} = {}) {
  if (!existsSync(dbPath)) {
    return { created: false, reason: 'no-database', file: null, pruned: [] };
  }

  const dir = backupDir || process.env.SUBMATE_BACKUP_DIR || join(dirname(dbPath), 'backups');
  mkdirSync(dir, { recursive: true });

  const prefix = basename(dbPath).replace(/\.sqlite3?$/i, '');
  const file = join(dir, `${prefix}-${stamp(now)}.sqlite`);

  const source = new DatabaseSync(dbPath);
  try {
    source.exec(`VACUUM INTO '${file.replace(/'/g, "''")}';`);
  } finally {
    source.close();
  }

  return { created: true, reason: null, file, pruned: pruneBackups(dir, prefix, keep) };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const result = createBackup();
  if (!result.created) {
    console.log(`No database found at ${DB_PATH}; nothing to back up.`);
    process.exit(0);
  }
  console.log('SubMate backup created:');
  console.log(`  ${result.file}`);
  if (result.pruned.length > 0) {
    console.log(`Pruned ${result.pruned.length} older backup(s).`);
  }
}
