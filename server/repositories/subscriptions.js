import { addDays, todayISO } from '../utils/dates.js';

const PUBLIC_COLUMNS = `
  id, service_name, service_key, logo_key, price, currency_code, billing_cycle,
  category, next_renewal_date, status, plan_name, notes, created_at, updated_at
`;

function renewalClause(window, today) {
  switch (window) {
    case 'today':
      return { sql: 'next_renewal_date = ?', params: [today] };
    case 'next7':
      return { sql: 'next_renewal_date >= ? AND next_renewal_date <= ?', params: [today, addDays(today, 7)] };
    case 'next30':
      return { sql: 'next_renewal_date >= ? AND next_renewal_date <= ?', params: [today, addDays(today, 30)] };
    case 'overdue':
      return { sql: 'next_renewal_date < ?', params: [today] };
    default:
      return null;
  }
}

export function createSubscriptionsRepository(db) {
  const selectAll = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM subscriptions`);
  const selectById = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM subscriptions WHERE id = ?`);

  const insertStatement = db.prepare(`
    INSERT INTO subscriptions (
      service_name, service_key, logo_key, price, currency_code, billing_cycle,
      category, next_renewal_date, status, plan_name, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const updateStatement = db.prepare(`
    UPDATE subscriptions SET
      service_name = ?, service_key = ?, logo_key = ?, price = ?, currency_code = ?,
      billing_cycle = ?, category = ?, next_renewal_date = ?, status = ?, plan_name = ?,
      notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const statusStatement = db.prepare(
    "UPDATE subscriptions SET status = ?, updated_at = datetime('now') WHERE id = ?",
  );
  const deleteStatement = db.prepare('DELETE FROM subscriptions WHERE id = ?');

  return {
    list(filters = {}, options = {}) {
      const { q, category, status, billingCycle, renewalWindow, sortColumn, sortOrder } = filters;
      const today = options.today || todayISO();
      const clauses = [];
      const params = [];

      if (q) {
        const like = `%${q.toLowerCase()}%`;
        clauses.push(
          "(LOWER(service_name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(COALESCE(plan_name, '')) LIKE ?)",
        );
        params.push(like, like, like);
      }
      if (category) {
        clauses.push('category = ?');
        params.push(category);
      }
      if (status) {
        clauses.push('status = ?');
        params.push(status);
      }
      if (billingCycle) {
        clauses.push('billing_cycle = ?');
        params.push(billingCycle);
      }
      if (renewalWindow) {
        const clause = renewalClause(renewalWindow, today);
        if (clause) {
          clauses.push(clause.sql);
          params.push(...clause.params);
        }
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const order = `ORDER BY ${sortColumn || 'next_renewal_date'} ${sortOrder || 'ASC'}`;
      const sql = `SELECT ${PUBLIC_COLUMNS} FROM subscriptions ${where} ${order}`;
      return db.prepare(sql).all(...params);
    },

    listAll() {
      return selectAll.all();
    },

    getById(id) {
      return selectById.get(id) || null;
    },

    insert(data) {
      const result = insertStatement.run(
        data.service_name,
        data.service_key,
        data.logo_key,
        data.price,
        data.currency_code,
        data.billing_cycle,
        data.category,
        data.next_renewal_date,
        data.status,
        data.plan_name,
        data.notes,
      );
      return selectById.get(Number(result.lastInsertRowid));
    },

    update(id, data) {
      updateStatement.run(
        data.service_name,
        data.service_key,
        data.logo_key,
        data.price,
        data.currency_code,
        data.billing_cycle,
        data.category,
        data.next_renewal_date,
        data.status,
        data.plan_name,
        data.notes,
        id,
      );
      return selectById.get(id);
    },

    updateStatus(id, status) {
      const result = statusStatement.run(status, id);
      if (Number(result.changes) === 0) return null;
      return selectById.get(id);
    },

    remove(id) {
      const result = deleteStatement.run(id);
      return Number(result.changes) > 0;
    },

    countByStatus() {
      const rows = db
        .prepare('SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status')
        .all();
      const counts = { active: 0, paused: 0, cancelled: 0 };
      for (const row of rows) {
        counts[row.status] = Number(row.count);
      }
      return counts;
    },
  };
}
