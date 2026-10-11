import { createSubscriptionsRepository } from '../repositories/subscriptions.js';
import { validateSubscriptionInput, STATUSES } from '../validation/subscription.js';
import { findPotentialDuplicates, normalizeServiceName } from './duplicates.js';
import { catalogSearch, getCatalogEntry } from '../catalog/services.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

function resolveCatalogFields(value) {
  const explicit = getCatalogEntry(value.service_key);
  if (explicit) {
    if (!value.logo_key) value.logo_key = explicit.logoKey;
    if (!value.category || value.category === 'Other') value.category = explicit.category;
    return value;
  }
  if (value.service_key) return value;
  const needle = normalizeServiceName(value.service_name);
  const match = catalogSearch(value.service_name).find(
    (entry) => normalizeServiceName(entry.name) === needle,
  );
  if (match) {
    value.service_key = match.key;
    value.logo_key = match.logoKey;
    if (!value.category || value.category === 'Other') value.category = match.category;
  }
  return value;
}

export function createSubscriptionsService(db) {
  const repo = createSubscriptionsRepository(db);

  function guardDuplicates(value, force, excludeId = null) {
    const duplicates = findPotentialDuplicates(repo.listAll(), value, excludeId);
    if (duplicates.length > 0 && !force) {
      throw new ConflictError('A similar subscription already exists.', {
        code: 'DUPLICATE_WARNING',
        duplicates,
      });
    }
    return duplicates;
  }

  return {
    list(query, options = {}) {
      return repo.list(query, options);
    },

    listAll() {
      return repo.listAll();
    },

    get(id) {
      const record = repo.getById(id);
      if (!record) throw new NotFoundError('Subscription not found.');
      return record;
    },

    create(payload, options = {}) {
      const { valid, errors, value } = validateSubscriptionInput(payload);
      if (!valid) throw new ValidationError(errors);
      resolveCatalogFields(value);
      const duplicates = guardDuplicates(value, options.force === true);
      const record = repo.insert(value);
      return { record, duplicates };
    },

    update(id, payload, options = {}) {
      const existing = repo.getById(id);
      if (!existing) throw new NotFoundError('Subscription not found.');
      const { valid, errors, value } = validateSubscriptionInput(payload);
      if (!valid) throw new ValidationError(errors);
      resolveCatalogFields(value);
      const duplicates = guardDuplicates(value, options.force === true, id);
      const record = repo.update(id, value);
      return { record, duplicates };
    },

    setStatus(id, status) {
      const normalized = String(status || '').trim().toLowerCase();
      if (!STATUSES.includes(normalized)) {
        throw new ValidationError({ status: 'Unsupported status.' });
      }
      const record = repo.updateStatus(id, normalized);
      if (!record) throw new NotFoundError('Subscription not found.');
      return record;
    },

    remove(id) {
      const existing = repo.getById(id);
      if (!existing) throw new NotFoundError('Subscription not found.');
      repo.remove(id);
      return existing;
    },

    countByStatus() {
      return repo.countByStatus();
    },
  };
}
