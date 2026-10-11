const DEFAULT_THRESHOLDS = [3, 7];

export function ensureSettings(db) {
  db.prepare(
    'INSERT OR IGNORE INTO settings (id, preferred_currency, reminder_thresholds) VALUES (1, ?, ?)',
  ).run('USD', JSON.stringify(DEFAULT_THRESHOLDS));
}

function mapRow(row) {
  if (!row) return null;
  let thresholds = DEFAULT_THRESHOLDS;
  try {
    const parsed = JSON.parse(row.reminder_thresholds);
    if (Array.isArray(parsed) && parsed.length > 0) thresholds = parsed;
  } catch {
    thresholds = DEFAULT_THRESHOLDS;
  }
  return {
    id: Number(row.id),
    preferred_currency: row.preferred_currency,
    monthly_budget: row.monthly_budget === null ? null : Number(row.monthly_budget),
    budget_currency: row.budget_currency || null,
    reminder_thresholds: thresholds,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createSettingsRepository(db) {
  const selectStatement = db.prepare('SELECT * FROM settings WHERE id = 1');
  const updateStatement = db.prepare(`
    UPDATE settings SET
      preferred_currency = ?, monthly_budget = ?, budget_currency = ?,
      reminder_thresholds = ?, updated_at = datetime('now')
    WHERE id = 1
  `);

  return {
    get() {
      ensureSettings(db);
      return mapRow(selectStatement.get());
    },
    update(value) {
      ensureSettings(db);
      updateStatement.run(
        value.preferred_currency,
        value.monthly_budget,
        value.budget_currency,
        JSON.stringify(value.reminder_thresholds),
      );
      return mapRow(selectStatement.get());
    },
  };
}
