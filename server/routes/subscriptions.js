import { Router } from 'express';
import { parseSubscriptionQuery } from '../validation/query.js';
import { BadRequestError } from '../utils/errors.js';

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError('Invalid subscription id.');
  }
  return id;
}

function wantsForce(req) {
  const queryForce = ['1', 'true', 'yes'].includes(String(req.query.force || '').toLowerCase());
  const bodyForce = req.body && req.body.allow_duplicate === true;
  return queryForce || bodyForce;
}

export function createSubscriptionsRouter(service) {
  const router = Router();

  router.get('/', (req, res) => {
    const query = parseSubscriptionQuery(req.query);
    const subscriptions = service.list(query);
    res.json({ subscriptions, count: subscriptions.length });
  });

  router.get('/:id', (req, res) => {
    const record = service.get(parseId(req.params.id));
    res.json(record);
  });

  router.post('/', (req, res) => {
    const { record, duplicates } = service.create(req.body, { force: wantsForce(req) });
    res.status(201).json({ subscription: record, duplicates });
  });

  router.put('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const { record, duplicates } = service.update(id, req.body, { force: wantsForce(req) });
    res.json({ subscription: record, duplicates });
  });

  router.patch('/:id/status', (req, res) => {
    const id = parseId(req.params.id);
    const record = service.setStatus(id, req.body && req.body.status);
    res.json({ subscription: record });
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const record = service.remove(id);
    res.json({ deleted: true, subscription: record });
  });

  return router;
}
