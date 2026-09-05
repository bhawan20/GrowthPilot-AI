import mongoose from "mongoose";
import Forecast from "../models/Forecast.js";
import Recommendation from "../models/Recommendation.js";
import Signal from "../models/Signal.js";
import Workspace from "../models/Workspace.js";
import { parsePagination } from "../utils/requestValidation.js";

const priorityRank = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function verifyWorkspace(req) {
  const { workspaceId } = req.query;

  if (typeof workspaceId !== "string" || !mongoose.isValidObjectId(workspaceId)) {
    throw createError("workspaceId is required", 400);
  }

  const workspace = await Workspace.findOne({
    _id: workspaceId,
    ownerId: req.user.userId,
  }).select("_id");

  if (!workspace) {
    throw createError("Workspace access denied", 403);
  }

  return workspace._id;
}

function normalizeCurrency(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function summarizeCurrencies(items) {
  const currencies = new Set();

  for (const item of items) {
    const currency = normalizeCurrency(item?.currency);
    if (currency) {
      currencies.add(currency);
    }
  }

  const orderedCurrencies = Array.from(currencies).sort();

  if (orderedCurrencies.length === 0) {
    return { currencyMode: "none", currencies: [] };
  }

  if (orderedCurrencies.length === 1) {
    return { currencyMode: "single", currencies: orderedCurrencies };
  }

  return { currencyMode: "multiple", currencies: orderedCurrencies };
}

function compareRecommendations(first, second) {
  const priorityDifference =
    (priorityRank[first.priority] ?? Number.MAX_SAFE_INTEGER) -
    (priorityRank[second.priority] ?? Number.MAX_SAFE_INTEGER);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const confidenceDifference = (second.confidence ?? -1) - (first.confidence ?? -1);

  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }

  const impactDifference = (second.expectedImpact ?? -1) - (first.expectedImpact ?? -1);

  if (impactDifference !== 0) {
    return impactDifference;
  }

  return second.createdAt - first.createdAt;
}

function compareSignals(first, second) {
  if (first.status === "active" && second.status !== "active") {
    return -1;
  }

  if (first.status !== "active" && second.status === "active") {
    return 1;
  }

  const scoreDifference = (second.score ?? -1) - (first.score ?? -1);

  if (scoreDifference !== 0) {
    return scoreDifference;
  }

  return second.createdAt - first.createdAt;
}

function compareForecasts(first, second) {
  const dateDifference = second.forecastDate - first.forecastDate;

  if (dateDifference !== 0) {
    return dateDifference;
  }

  const confidenceDifference = (second.confidence ?? -1) - (first.confidence ?? -1);

  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }

  return (second.predictedValue ?? -1) - (first.predictedValue ?? -1);
}

function formatRecommendation(recommendation) {
  return {
    id: recommendation._id.toString(),
    customerId: recommendation.customerId?.toString(),
    title: recommendation.title,
    rationale: recommendation.rationale,
    recommendedAction: recommendation.recommendedAction,
    expectedImpact: recommendation.expectedImpact,
    currency: recommendation.currency,
    confidence: recommendation.confidence,
    priority: recommendation.priority,
    status: recommendation.status,
    sourceSignalIds: recommendation.sourceSignalIds?.map((id) => id.toString()),
    modelVersion: recommendation.modelVersion,
    createdAt: recommendation.createdAt,
    updatedAt: recommendation.updatedAt,
  };
}

function formatSignal(signal) {
  return {
    id: signal._id.toString(),
    type: signal.type,
    description: signal.description,
    score: signal.score,
    status: signal.status,
    createdAt: signal.createdAt,
    updatedAt: signal.updatedAt,
  };
}

function formatForecast(forecast) {
  return {
    id: forecast._id.toString(),
    customerId: forecast.customerId?.toString(),
    metric: forecast.metric,
    period: forecast.period,
    forecastDate: forecast.forecastDate,
    predictedValue: forecast.predictedValue,
    currency: forecast.currency,
    confidence: forecast.confidence,
    lowerBound: forecast.lowerBound,
    upperBound: forecast.upperBound,
    source: forecast.source,
    modelVersion: forecast.modelVersion,
    createdAt: forecast.createdAt,
    updatedAt: forecast.updatedAt,
  };
}

export async function getDecisionCenter(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const pagination = parsePagination(req.query);
    const [recommendations, signals, forecasts, recommendationCurrencies, forecastCurrencies, recommendationCount, highPriorityCount, activeSignalCount, acceptedCount, pendingCount, forecastCount] = await Promise.all([
      Recommendation.find({ workspaceId }).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      Signal.find({ workspaceId }).sort({ detectedAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      Forecast.find({ workspaceId }).sort({ forecastDate: -1, createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      Recommendation.distinct("currency", { workspaceId }),
      Forecast.distinct("currency", { workspaceId }),
      Recommendation.countDocuments({ workspaceId }),
      Recommendation.countDocuments({ workspaceId, priority: { $in: ["high", "critical"] } }),
      Signal.countDocuments({ workspaceId, status: "active" }),
      Recommendation.countDocuments({ workspaceId, status: "accepted" }),
      Recommendation.countDocuments({ workspaceId, status: "proposed" }),
      Forecast.countDocuments({ workspaceId }),
    ]);

    const sortedRecommendations = recommendations.sort(compareRecommendations);
    const sortedSignals = signals.sort(compareSignals);
    const sortedForecasts = forecasts.sort(compareForecasts);
    const recommendationCurrencySummary = summarizeCurrencies([
      ...recommendations,
      ...recommendationCurrencies.map((currency) => ({ currency })),
    ]);
    const forecastCurrencySummary = summarizeCurrencies([
      ...forecasts,
      ...forecastCurrencies.map((currency) => ({ currency })),
    ]);
    const combinedCurrencies = Array.from(
      new Set([
        ...recommendationCurrencySummary.currencies,
        ...forecastCurrencySummary.currencies,
      ]),
    ).sort();
    const currencyMode = combinedCurrencies.length === 0
      ? "none"
      : combinedCurrencies.length === 1
        ? "single"
        : "multiple";

    res.json({
      success: true,
      decisionCenter: {
        workspaceId: workspaceId.toString(),
        currencyMode,
        currencies: combinedCurrencies,
        summary: {
          totalRecommendations: recommendationCount,
          highPriorityRecommendations: highPriorityCount,
          activeSignals: activeSignalCount,
          acceptedRecommendations: acceptedCount,
          pendingRecommendations: pendingCount,
          forecastCount,
        },
        topRecommendations: sortedRecommendations.slice(0, 5).map(formatRecommendation),
        topSignals: sortedSignals.slice(0, 5).map(formatSignal),
        forecastHighlights: sortedForecasts.slice(0, 5).map(formatForecast),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getDecisionCenterRecommendations(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const pagination = parsePagination(req.query);
    const [recommendations, currencies] = await Promise.all([
      Recommendation.find({ workspaceId }).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      Recommendation.distinct("currency", { workspaceId }),
    ]);
    const currencySummary = summarizeCurrencies([
      ...recommendations,
      ...currencies.map((currency) => ({ currency })),
    ]);

    res.json({
      success: true,
      workspaceId: workspaceId.toString(),
      currencyMode: currencySummary.currencyMode,
      currencies: currencySummary.currencies,
      recommendations: recommendations.sort(compareRecommendations).map(formatRecommendation),
    });
  } catch (error) {
    next(error);
  }
}

export async function getDecisionCenterSignals(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const pagination = parsePagination(req.query);
    const signals = await Signal.find({ workspaceId })
      .sort({ detectedAt: -1 })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .lean();
    const active = signals.filter((signal) => signal.status === "active").length;
    const resolved = signals.filter((signal) => signal.status === "resolved").length;
    const dismissed = signals.filter((signal) => signal.status === "dismissed").length;

    res.json({
      success: true,
      workspaceId: workspaceId.toString(),
      total: signals.length,
      active,
      resolved,
      dismissed,
      signals: signals.sort(compareSignals).map(formatSignal),
    });
  } catch (error) {
    next(error);
  }
}

export async function getDecisionCenterForecasts(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const pagination = parsePagination(req.query);
    const [forecasts, currencies] = await Promise.all([
      Forecast.find({ workspaceId }).sort({ forecastDate: -1, createdAt: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
      Forecast.distinct("currency", { workspaceId }),
    ]);
    const currencySummary = summarizeCurrencies([
      ...forecasts,
      ...currencies.map((currency) => ({ currency })),
    ]);

    res.json({
      success: true,
      workspaceId: workspaceId.toString(),
      currencyMode: currencySummary.currencyMode,
      currencies: currencySummary.currencies,
      total: forecasts.length,
      forecasts: forecasts.sort(compareForecasts).map(formatForecast),
    });
  } catch (error) {
    next(error);
  }
}
