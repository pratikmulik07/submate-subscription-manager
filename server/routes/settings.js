import { Router } from 'express';

export function createSettingsRouter(settingsService) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ settings: settingsService.get() });
  });

  router.put('/', (req, res) => {
    const settings = settingsService.save(req.body);
    res.json({ settings });
  });

  return router;
}
