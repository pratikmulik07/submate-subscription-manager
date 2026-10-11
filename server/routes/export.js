import { buildSubscriptionsCsv } from '../services/csv.js';
import { todayISO } from '../utils/dates.js';

export function createExportHandler(subscriptionsService) {
  return (_req, res) => {
    const subscriptions = subscriptionsService.listAll();
    const csv = buildSubscriptionsCsv(subscriptions);
    const filename = `submate-subscriptions-${todayISO()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  };
}
