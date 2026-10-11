import {
  annualTotalsByCurrency,
  categoryTotalsByCurrency,
  mostExpensive,
  monthlyTotalsByCurrency,
} from './calculations.js';
import { buildRenewalBuckets } from './renewals.js';
import { round2 } from './money.js';

function cancelledSummary(subscription) {
  return {
    id: subscription.id,
    service_name: subscription.service_name,
    category: subscription.category,
    price: subscription.price,
    currency_code: subscription.currency_code,
    billing_cycle: subscription.billing_cycle,
    next_renewal_date: subscription.next_renewal_date,
    updated_at: subscription.updated_at,
  };
}

export function buildDashboard({ subscriptions, settings, today }) {
  const counts = { active: 0, paused: 0, cancelled: 0 };
  for (const subscription of subscriptions) {
    counts[subscription.status] = (counts[subscription.status] || 0) + 1;
  }

  const monthlyByCurrency = monthlyTotalsByCurrency(subscriptions);
  const annualByCurrency = annualTotalsByCurrency(subscriptions);
  const categoriesByCurrency = categoryTotalsByCurrency(subscriptions);
  const buckets = buildRenewalBuckets(subscriptions, today, settings.reminder_thresholds);

  const recentlyCancelled = subscriptions
    .filter((subscription) => subscription.status === 'cancelled')
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, 5)
    .map(cancelledSummary);

  const budgetCurrency = settings.budget_currency || settings.preferred_currency;
  const budgetLimit = settings.monthly_budget;
  const budgetConfigured = budgetLimit !== null && budgetLimit !== undefined;
  const spendEntry = monthlyByCurrency.find((entry) => entry.currency === budgetCurrency);
  const budgetMonthlySpend = spendEntry ? spendEntry.amount : 0;

  return {
    as_of: today,
    total_count: subscriptions.length,
    active_count: counts.active,
    paused_count: counts.paused,
    cancelled_count: counts.cancelled,
    preferred_currency: settings.preferred_currency,
    reminder_thresholds: settings.reminder_thresholds,
    monthly_by_currency: monthlyByCurrency,
    annual_by_currency: annualByCurrency,
    categories_by_currency: categoriesByCurrency,
    upcoming: {
      today: buckets.today,
      within7: buckets.within7,
      within30: buckets.within30,
      overdue: buckets.overdue,
      reminders: buckets.reminders,
      all: buckets.all,
    },
    top_expensive: mostExpensive(subscriptions, 5),
    recently_cancelled: recentlyCancelled,
    budget: {
      configured: budgetConfigured,
      currency: budgetCurrency,
      limit: budgetConfigured ? round2(budgetLimit) : null,
      monthly_spend: round2(budgetMonthlySpend),
      remaining: budgetConfigured ? round2(budgetLimit - budgetMonthlySpend) : null,
      used_percent:
        budgetConfigured && budgetLimit > 0
          ? Math.round((budgetMonthlySpend / budgetLimit) * 1000) / 10
          : null,
      over_budget: budgetConfigured ? budgetMonthlySpend > budgetLimit : false,
    },
  };
}
