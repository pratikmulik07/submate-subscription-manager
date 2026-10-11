import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../server/db/connection.js';
import { createSubscriptionsService } from '../server/services/subscriptions.js';
import { createSettingsService } from '../server/services/settings.js';
import { sampleSubscription } from './helpers/server.js';

test('database initializes automatically and persists across a restart', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'submate-test-'));
  const dbPath = join(dir, 'submate.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  let db = createDatabase(dbPath);
  const subscriptions = createSubscriptionsService(db);
  const settings = createSettingsService(db);

  const { record } = subscriptions.create(sampleSubscription());
  settings.save({
    preferred_currency: 'GBP',
    monthly_budget: 500,
    budget_currency: 'GBP',
    reminder_thresholds: [2, 4],
  });
  db.close();

  // Simulate a backend restart by reopening the same file.
  db = createDatabase(dbPath);
  try {
    const reopenedSubscriptions = createSubscriptionsService(db);
    const reopenedSettings = createSettingsService(db);

    const list = reopenedSubscriptions.listAll();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, record.id);
    assert.equal(list[0].service_name, 'Netflix');

    const saved = reopenedSettings.get();
    assert.equal(saved.preferred_currency, 'GBP');
    assert.equal(saved.monthly_budget, 500);
    assert.deepEqual(saved.reminder_thresholds, [2, 4]);
  } finally {
    db.close();
  }
});
