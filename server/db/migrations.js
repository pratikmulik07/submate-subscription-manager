// Ordered, idempotent database migrations. Each migration runs once and is
// recorded in schema_migrations so restarts never wipe existing records.

const migrations = [
  {
    id: 1,
    name: 'initial subscriptions and settings schema',
    up(db) {
      db.exec(`
        CREATE TABLE subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          service_name TEXT NOT NULL CHECK (length(trim(service_name)) > 0),
          service_key TEXT,
          logo_key TEXT,
          price REAL NOT NULL CHECK (price > 0),
          currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
          billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly')),
          category TEXT NOT NULL CHECK (length(trim(category)) > 0),
          next_renewal_date TEXT NOT NULL CHECK (next_renewal_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
          plan_name TEXT,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX idx_subscriptions_status ON subscriptions (status);
        CREATE INDEX idx_subscriptions_renewal ON subscriptions (next_renewal_date);
        CREATE INDEX idx_subscriptions_category ON subscriptions (category);
        CREATE INDEX idx_subscriptions_service_key ON subscriptions (service_key);

        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          preferred_currency TEXT NOT NULL DEFAULT 'USD',
          monthly_budget REAL CHECK (monthly_budget IS NULL OR monthly_budget >= 0),
          budget_currency TEXT,
          reminder_thresholds TEXT NOT NULL DEFAULT '[3,7]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    id: 2,
    name: 'local single-user login and sessions',
    up(db) {
      db.exec(`
        CREATE TABLE local_account (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          username TEXT NOT NULL CHECK (length(trim(username)) BETWEEN 2 AND 60),
          password_salt BLOB NOT NULL,
          password_hash BLOB NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE auth_sessions (
          token_hash TEXT PRIMARY KEY,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX idx_auth_sessions_expiry ON auth_sessions (expires_at);
      `);
    },
  },
];

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => Number(row.id)),
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    db.exec('BEGIN');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
        migration.id,
        migration.name,
      );
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export const migrationCount = migrations.length;
