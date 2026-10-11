import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../server/db/connection.js';
import { createBackup } from '../scripts/backup-db.js';

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'submate-backup-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedDatabase(dbPath) {
  const db = createDatabase(dbPath);
  db.prepare(
    `INSERT INTO subscriptions
       (service_name, price, currency_code, billing_cycle, category, next_renewal_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('Netflix', 15.49, 'USD', 'monthly', 'Video & Streaming', '2026-10-15');
  db.close();
}

test('createBackup copies a live database and preserves its rows', () => {
  withTempDir((dir) => {
    const dbPath = join(dir, 'submate.sqlite');
    seedDatabase(dbPath);

    const result = createBackup({ dbPath, backupDir: join(dir, 'backups') });
    assert.equal(result.created, true);
    assert.ok(existsSync(result.file));

    const backup = new DatabaseSync(result.file);
    const rows = backup.prepare('SELECT service_name FROM subscriptions').all();
    backup.close();

    assert.equal(rows.length, 1);
    assert.equal(rows[0].service_name, 'Netflix');
  });
});

test('createBackup reports when there is no database to copy', () => {
  withTempDir((dir) => {
    const result = createBackup({ dbPath: join(dir, 'missing.sqlite'), backupDir: dir });
    assert.equal(result.created, false);
    assert.equal(result.reason, 'no-database');
    assert.equal(result.file, null);
  });
});

test('createBackup prunes older backups beyond the retention limit', () => {
  withTempDir((dir) => {
    const dbPath = join(dir, 'submate.sqlite');
    const backupDir = join(dir, 'backups');
    seedDatabase(dbPath);

    for (let i = 0; i < 5; i += 1) {
      createBackup({
        dbPath,
        backupDir,
        keep: 2,
        now: new Date(1700000000000 + i * 1000),
      });
    }

    const files = readdirSync(backupDir).filter((name) => name.endsWith('.sqlite'));
    assert.equal(files.length, 2);
  });
});
