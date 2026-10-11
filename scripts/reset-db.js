// Deliberate database reset. This is destructive and requires --yes.
import { existsSync, rmSync } from 'node:fs';
import { DB_PATH } from '../server/config.js';
import { createDatabase } from '../server/db/connection.js';

const confirmed = process.argv.includes('--yes') || process.argv.includes('-y');

if (!confirmed) {
  console.log('This will permanently delete your local SubMate database and all saved records:');
  console.log(`  ${DB_PATH}`);
  console.log('');
  console.log('To proceed, run:');
  console.log('  npm run db:reset -- --yes');
  process.exit(0);
}

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const file = `${DB_PATH}${suffix}`;
  if (existsSync(file)) rmSync(file);
}

const db = createDatabase(DB_PATH);
db.close();

console.log('SubMate database reset. A fresh, empty database was created at:');
console.log(`  ${DB_PATH}`);
