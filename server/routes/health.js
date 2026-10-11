import { Router } from 'express';

export function createHealthRouter(db) {
  const router = Router();

  router.get('/', (_req, res) => {
    let database = 'ready';
    try {
      const check = db.prepare('SELECT 1 AS ok').get();
      if (!check || Number(check.ok) !== 1) database = 'degraded';
    } catch {
      database = 'unavailable';
    }
    res.json({
      status: database === 'ready' ? 'ok' : 'degraded',
      database,
      time: new Date().toISOString(),
    });
  });

  return router;
}
