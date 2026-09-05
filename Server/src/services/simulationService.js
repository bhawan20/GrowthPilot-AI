import Customer from "../models/Customer.js";
import Forecast from "../models/Forecast.js";
import RevenueEvent from "../models/RevenueEvent.js";

function normalizeCurrency(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : null;
}

export async function runWorkspaceSimulation(workspaceId, marketingBudget, discountPercent) {
  const [customerCount, revenueEvents, latestForecast] = await Promise.all([
    Customer.countDocuments({ workspaceId }),
    RevenueEvent.find({ workspaceId }).select("amount currency").lean(),
    Forecast.findOne({ workspaceId }).sort({ forecastDate: -1, createdAt: -1 }).lean(),
  ]);

  const groupedRevenue = new Map();

  for (const event of revenueEvents) {
    const currency = normalizeCurrency(event.currency);
    if (!currency) {
      continue;
    }

    const summary = groupedRevenue.get(currency) ?? {
      currency,
      totalRevenue: 0,
      revenueEventCount: 0,
    };

    summary.totalRevenue += Number(event.amount) || 0;
    summary.revenueEventCount += 1;
    groupedRevenue.set(currency, summary);
  }

  const currencySummaries = Array.from(groupedRevenue.values())
    .map((summary) => ({
      currency: summary.currency,
      totalRevenue: summary.totalRevenue,
      averageRevenuePerEvent: summary.revenueEventCount ? summary.totalRevenue / summary.revenueEventCount : 0,
      revenueEventCount: summary.revenueEventCount,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const currencyMode = currencySummaries.length === 0
    ? "none"
    : currencySummaries.length === 1
      ? "single"
      : "multiple";

  const selectedCurrency = currencyMode === "single" ? currencySummaries[0].currency : null;
  const normalizedForecastCurrency = normalizeCurrency(latestForecast?.currency);
  const forecastIsCompatible = Boolean(
    selectedCurrency && normalizedForecastCurrency && normalizedForecastCurrency === selectedCurrency,
  );

  const forecastUsed = {
    used: Boolean(latestForecast && forecastIsCompatible),
    value: latestForecast?.predictedValue ?? null,
    currency: normalizedForecastCurrency ?? latestForecast?.currency ?? null,
    forecastDate: latestForecast?.forecastDate?.toISOString() ?? null,
  };

  const baselineSummary = currencyMode === "single" ? currencySummaries[0] : null;
  let baselineRevenue = 0;
  let projectedRevenue = 0;
  let estimatedRevenueChange = 0;
  let estimatedRevenueChangePercent = 0;
  let estimatedCustomerGrowth = 0;
  let requiresCurrencySelection = false;

  if (currencyMode === "single" && baselineSummary) {
    baselineRevenue = forecastIsCompatible && Number.isFinite(latestForecast?.predictedValue)
      ? Number(latestForecast.predictedValue)
      : baselineSummary.averageRevenuePerEvent;

    const marketingImpact = baselineRevenue > 0
      ? Math.min(marketingBudget / Math.max(baselineRevenue, 1), 0.25)
      : 0;
    const discountImpact = discountPercent > 0
      ? Math.min((discountPercent / 100) * 0.15, 0.15)
      : 0;

    projectedRevenue = baselineRevenue * (1 + marketingImpact + discountImpact);
    estimatedRevenueChange = projectedRevenue - baselineRevenue;
    estimatedRevenueChangePercent = baselineRevenue > 0
      ? (estimatedRevenueChange / baselineRevenue) * 100
      : 0;
    estimatedCustomerGrowth = customerCount > 0
      ? Math.min(
        customerCount * (marketingImpact * 0.6 + discountImpact * 0.4),
        customerCount * 0.3,
      )
      : 0;
  } else if (currencyMode === "multiple") {
    requiresCurrencySelection = true;
    baselineRevenue = null;
    projectedRevenue = null;
    estimatedRevenueChange = null;
    estimatedRevenueChangePercent = null;
    estimatedCustomerGrowth = 0;
  } else if (currencyMode === "none") {
    baselineRevenue = 0;
    projectedRevenue = 0;
    estimatedRevenueChange = 0;
    estimatedRevenueChangePercent = 0;
    estimatedCustomerGrowth = 0;
  }

  return {
    currencyMode,
    currency: selectedCurrency,
    requiresCurrencySelection,
    currencySummaries,
    baseline: {
      totalRevenue: currencyMode === "multiple" ? null : (baselineSummary?.totalRevenue ?? 0),
      averageRevenuePerEvent: currencyMode === "multiple" ? null : (baselineSummary?.averageRevenuePerEvent ?? 0),
      customerCount,
      revenueEventCount: currencyMode === "multiple" ? currencySummaries.reduce((total, item) => total + item.revenueEventCount, 0) : (baselineSummary?.revenueEventCount ?? 0),
      forecastUsed,
    },
    scenario: { marketingBudget, discountPercent, requiresCurrencySelection },
    simulation: {
      baselineRevenue,
      projectedRevenue,
      estimatedRevenueChange,
      estimatedRevenueChangePercent,
      estimatedCustomerGrowth,
      currencyMode,
      currency: selectedCurrency,
      requiresCurrencySelection,
    },
    metadata: {
      mode: "deterministic-what-if",
      readOnly: true,
      dataSources: ["customers", "revenue-events", "forecasts"],
      assumptions: [
        "Marketing impact is capped at 25% of the baseline revenue.",
        "Discount impact is capped at 15% of the baseline revenue.",
        "Customer growth is capped at 30% of the persisted customer count.",
        "Baseline revenue only uses the latest forecast when its currency matches the revenue currency; otherwise it uses the single-currency average revenue per event, or zero when no safe baseline is available.",
        "Mixed-currency workspaces do not combine values into a single monetary result; they require a currency selection before running the scenario.",
        "This is a deterministic scenario estimate, not an ML or AI prediction.",
      ],
    },
  };
}