import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Forecast from "../models/Forecast.js";
import Recommendation from "../models/Recommendation.js";
import RevenueEvent from "../models/RevenueEvent.js";
import Signal from "../models/Signal.js";
import Workspace from "../models/Workspace.js";

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

function currencySummary(byCurrency) {
  if (byCurrency.length === 0) {
    return { currencyMode: "none", currency: null };
  }

  if (byCurrency.length === 1) {
    return { currencyMode: "single", currency: byCurrency[0].currency };
  }

  return { currencyMode: "multiple", currency: null };
}

function formatAverage(value) {
  return value ?? 0;
}

export async function getOverviewAnalytics(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const [customerTotal, revenueResult, signalResult, recommendationResult, forecastTotal] = await Promise.all([
      Customer.countDocuments({ workspaceId }),
      RevenueEvent.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: "$currency", totalAmount: { $sum: "$amount" }, eventCount: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Signal.aggregate([
        { $match: { workspaceId } },
        {
          $facet: {
            total: [{ $count: "count" }],
            statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          },
        },
      ]),
      Recommendation.aggregate([
        { $match: { workspaceId } },
        {
          $facet: {
            total: [{ $count: "count" }],
            statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          },
        },
      ]),
      Forecast.countDocuments({ workspaceId }),
    ]);

    const revenueCurrencies = revenueResult.map((item) => ({
      currency: item._id,
      totalAmount: item.totalAmount,
      eventCount: item.eventCount,
    }));
    const revenueMode = currencySummary(revenueCurrencies);
    const signalAggregation = signalResult[0] ?? {};
    const recommendationAggregation = recommendationResult[0] ?? {};
    const signalCounts = Object.fromEntries((signalAggregation.statuses ?? []).map((item) => [item._id, item.count]));
    const recommendationCounts = Object.fromEntries((recommendationAggregation.statuses ?? []).map((item) => [item._id, item.count]));

    res.json({
      success: true,
      overview: {
        workspaceId: workspaceId.toString(),
        customers: { total: customerTotal },
        revenue: {
          totalEvents: revenueCurrencies.reduce((total, item) => total + item.eventCount, 0),
          totalAmount: revenueMode.currencyMode === "multiple" ? null : (revenueCurrencies[0]?.totalAmount ?? 0),
          ...revenueMode,
        },
        signals: {
          total: signalAggregation.total?.[0]?.count ?? 0,
          active: signalCounts.active ?? 0,
          resolved: signalCounts.resolved ?? 0,
          dismissed: signalCounts.dismissed ?? 0,
        },
        recommendations: {
          total: recommendationAggregation.total?.[0]?.count ?? 0,
          pending: recommendationCounts.pending ?? 0,
          proposed: recommendationCounts.proposed ?? 0,
          accepted: recommendationCounts.accepted ?? 0,
          rejected: recommendationCounts.rejected ?? 0,
          completed: recommendationCounts.completed ?? 0,
        },
        forecasts: { total: forecastTotal },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getRevenueAnalytics(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const [result] = await RevenueEvent.aggregate([
      { $match: { workspaceId } },
      {
        $facet: {
          summary: [
            { $group: { _id: "$currency", totalEvents: { $sum: 1 }, totalRevenue: { $sum: "$amount" }, averageRevenue: { $avg: "$amount" } } },
          ],
          byCurrency: [
            { $group: { _id: "$currency", totalRevenue: { $sum: "$amount" }, eventCount: { $sum: 1 } } },
            { $sort: { totalRevenue: -1, _id: 1 } },
          ],
          bySource: [
            { $group: { _id: { source: { $ifNull: ["$source", "unknown"] }, currency: "$currency" }, totalRevenue: { $sum: "$amount" }, eventCount: { $sum: 1 } } },
            { $sort: { totalRevenue: -1, "_id.source": 1, "_id.currency": 1 } },
          ],
          latest: [
            { $sort: { occurredAt: -1, _id: -1 } },
            { $limit: 1 },
            { $project: { _id: 0, amount: 1, currency: 1 } },
          ],
          recent: [
            { $sort: { occurredAt: -1, _id: -1 } },
            { $limit: 5 },
            { $project: { _id: 0, amount: 1, currency: 1, occurredAt: 1, source: 1 } },
          ],
          trend: [
            {
              $group: {
                _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" } }, currency: "$currency" },
                totalRevenue: { $sum: "$amount" },
                eventCount: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    const byCurrency = result?.byCurrency.map((item) => ({
      currency: item._id,
      totalRevenue: item.totalRevenue,
      eventCount: item.eventCount,
    })) ?? [];
    const currencySummaries = result?.summary.map((item) => ({
      currency: item._id,
      totalRevenue: item.totalRevenue,
      averageRevenue: item.averageRevenue,
      eventCount: item.totalEvents,
    })) ?? [];
    const bySource = result?.bySource.map((item) => ({
      source: item._id.source,
      currency: item._id.currency,
      totalRevenue: item.totalRevenue,
      eventCount: item.eventCount,
    })) ?? [];
    const mode = currencySummary(byCurrency);
    const summary = currencySummaries.length === 1 ? currencySummaries[0] : null;
    const latest = result?.latest[0];
    const recent = result?.recent ?? [];
    const trend = result?.trend ?? [];

    res.json({
      success: true,
      revenue: {
        workspaceId: workspaceId.toString(),
        totalEvents: summary?.eventCount ?? 0,
        totalRevenue: mode.currencyMode === "multiple" ? null : (summary?.totalRevenue ?? 0),
        averageRevenue: mode.currencyMode === "multiple" ? null : formatAverage(summary?.averageRevenue),
        latestRevenue: latest?.amount ?? 0,
        latestCurrency: latest?.currency ?? null,
        recent: recent.map((item) => ({
          amount: item.amount,
          currency: item.currency,
          occurredAt: item.occurredAt,
          source: item.source,
        })),
        trend: trend.map((item) => ({
          date: item._id.date,
          currency: item._id.currency,
          totalRevenue: item.totalRevenue,
          eventCount: item.eventCount,
        })),
        ...mode,
        byCurrency,
        currencySummaries,
        bySource,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSignalAnalytics(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const [result] = await Signal.aggregate([
      { $match: { workspaceId } },
      {
        $facet: {
          total: [{ $count: "count" }],
          statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byType: [
            { $group: { _id: "$type", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
          ],
          score: [{ $match: { score: { $exists: true, $ne: null } } }, { $group: { _id: null, averageScore: { $avg: "$score" } } }],
        },
      },
    ]);
    const statuses = Object.fromEntries((result?.statuses ?? []).map((item) => [item._id, item.count]));

    res.json({
      success: true,
      signals: {
        workspaceId: workspaceId.toString(),
        total: result?.total[0]?.count ?? 0,
        active: statuses.active ?? 0,
        resolved: statuses.resolved ?? 0,
        dismissed: statuses.dismissed ?? 0,
        byType: (result?.byType ?? []).map((item) => ({ type: item._id, count: item.count })),
        averageScore: formatAverage(result?.score[0]?.averageScore),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecommendationAnalytics(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const [result] = await Recommendation.aggregate([
      { $match: { workspaceId } },
      {
        $facet: {
          total: [{ $count: "count" }],
          statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          byPriority: [
            { $group: { _id: "$priority", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
          ],
          confidence: [{ $match: { confidence: { $exists: true, $ne: null } } }, { $group: { _id: null, averageConfidence: { $avg: "$confidence" } } }],
        },
      },
    ]);
    const statuses = Object.fromEntries((result?.statuses ?? []).map((item) => [item._id, item.count]));

    res.json({
      success: true,
      recommendations: {
        workspaceId: workspaceId.toString(),
        total: result?.total[0]?.count ?? 0,
        pending: statuses.pending ?? 0,
        proposed: statuses.proposed ?? 0,
        accepted: statuses.accepted ?? 0,
        rejected: statuses.rejected ?? 0,
        completed: statuses.completed ?? 0,
        byPriority: (result?.byPriority ?? []).map((item) => ({ priority: item._id, count: item.count })),
        averageConfidence: formatAverage(result?.confidence[0]?.averageConfidence),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getForecastAnalytics(req, res, next) {
  try {
    const workspaceId = await verifyWorkspace(req);
    const [result] = await Forecast.aggregate([
      { $match: { workspaceId } },
      {
        $facet: {
          summary: [{ $group: { _id: "$currency", forecastCount: { $sum: 1 }, totalPredictedValue: { $sum: "$predictedValue" }, averagePredictedValue: { $avg: "$predictedValue" } } }],
          confidence: [{ $match: { confidence: { $exists: true, $ne: null } } }, { $group: { _id: null, averageConfidence: { $avg: "$confidence" } } }],
          byPeriod: [
            { $group: { _id: "$period", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
          ],
          byMetric: [
            { $group: { _id: "$metric", count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
          ],
        },
      },
    ]);
    const currencySummaries = (result?.summary ?? []).map((item) => ({
      currency: item._id,
      totalPredictedValue: item.totalPredictedValue,
      averagePredictedValue: item.averagePredictedValue,
      forecastCount: item.forecastCount,
    }));
    const forecastMode = currencySummary(currencySummaries);
    const summary = currencySummaries.length === 1 ? currencySummaries[0] : null;

    res.json({
      success: true,
      forecasts: {
        workspaceId: workspaceId.toString(),
        total: summary?.forecastCount ?? 0,
        averagePredictedValue: forecastMode.currencyMode === "multiple" ? null : formatAverage(summary?.averagePredictedValue),
        totalPredictedValue: forecastMode.currencyMode === "multiple" ? null : (summary?.totalPredictedValue ?? 0),
        averageConfidence: formatAverage(result?.confidence[0]?.averageConfidence),
        byPeriod: (result?.byPeriod ?? []).map((item) => ({ period: item._id, count: item.count })),
        byMetric: (result?.byMetric ?? []).map((item) => ({ metric: item._id, count: item.count })),
        ...forecastMode,
        currencySummaries,
      },
    });
  } catch (error) {
    next(error);
  }
}
