import { Router } from 'express';
import { buildDashboard } from '../services/dashboard.js';
import { todayISO } from '../utils/dates.js';

export function createDashboardRouter({ subscriptionsService, settingsService }) {
  const router = Router();

  router.get('/', (_req, res) => {
    const today = todayISO();
    const subscriptions = subscriptionsService.listAll();
    const settings = settingsService.get();
    res.json(buildDashboard({ subscriptions, settings, today }));
  });

  return router;
}
