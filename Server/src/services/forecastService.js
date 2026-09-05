import Forecast from "../models/Forecast.js";
import RevenueEvent from "../models/RevenueEvent.js";

const GENERATED_SOURCE = "revenue-history";
const MODEL_VERSION = "revenue-average-v1";
const MINIMUM_REVENUE_DAYS = 3;
const RECENT_DAYS = 7;

function utcDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function normalizeCurrency(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function nextUtcDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export async function generateWorkspaceForecasts(workspaceId) {
  const revenueEvents = await RevenueEvent.find({ workspaceId }).sort({ occurredAt: 1, _id: 1 }).lean();
  const byCurrency = new Map();

  for (const event of revenueEvents) {
    const currency = normalizeCurrency(event.currency);
    if (!currency) {
      continue;
    }

    const day = utcDateKey(event.occurredAt);
    const dailyRevenue = byCurrency.get(currency) || new Map();
    dailyRevenue.set(day, (dailyRevenue.get(day) || 0) + event.amount);
    byCurrency.set(currency, dailyRevenue);
  }

  const forecasts = [];
  const insufficientCurrencies = [];

  for (const [currency, dailyRevenue] of byCurrency) {
    const dailyEntries = [...dailyRevenue.entries()].sort(([first], [second]) => first.localeCompare(second));
    if (dailyEntries.length < MINIMUM_REVENUE_DAYS) {
      insufficientCurrencies.push(currency);
      continue;
    }

    const recentEntries = dailyEntries.slice(-RECENT_DAYS);
    const predictedValue = recentEntries.reduce((total, [, amount]) => total + amount, 0) / recentEntries.length;
    const forecastDate = nextUtcDate(dailyEntries[dailyEntries.length - 1][0]);
    const forecast = await Forecast.findOneAndUpdate(
      {
        workspaceId,
        currency,
        metric: "revenue",
        period: "daily",
        forecastDate,
        source: GENERATED_SOURCE,
        modelVersion: MODEL_VERSION,
      },
      {
        $set: {
          predictedValue,
          confidence: Math.min(1, recentEntries.length / RECENT_DAYS),
          lowerBound: Math.max(0, predictedValue * 0.8),
          upperBound: predictedValue * 1.2,
        },
        $setOnInsert: {
          workspaceId,
          currency,
          metric: "revenue",
          period: "daily",
          forecastDate,
          source: GENERATED_SOURCE,
          modelVersion: MODEL_VERSION,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    forecasts.push(forecast);
  }

  return {
    forecasts,
    insufficientCurrencies,
    revenueEventCount: revenueEvents.length,
    currencyMode: forecasts.length === 0 ? "none" : forecasts.length === 1 ? "single" : "multiple",
    currencies: Array.from(new Set(forecasts.map((forecast) => normalizeCurrency(forecast.currency)).filter(Boolean))).sort(),
  };
}

export { GENERATED_SOURCE, MODEL_VERSION, MINIMUM_REVENUE_DAYS };