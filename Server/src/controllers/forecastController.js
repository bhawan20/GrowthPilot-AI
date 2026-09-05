import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Forecast from "../models/Forecast.js";
import { generateWorkspaceForecasts } from "../services/forecastService.js";
import Workspace from "../models/Workspace.js";
import { parsePagination, requireObjectBody, validateStringLength } from "../utils/requestValidation.js";

const periodValues = ["daily", "weekly", "monthly"];

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatForecast(forecast) {
  return {
    id: forecast._id.toString(),
    workspaceId: forecast.workspaceId.toString(),
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

function normalizeCurrency(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function summarizeForecastCurrencies(items) {
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

function validateForecastFields(body) {
  const {
    workspaceId,
    customerId,
    metric,
    period,
    forecastDate,
    predictedValue,
    currency,
    confidence,
    lowerBound,
    upperBound,
  } = body;

  if (typeof workspaceId !== "string" || !mongoose.isValidObjectId(workspaceId)) {
    throw createError("workspaceId is required", 400);
  }

  if (customerId !== undefined &&
    (typeof customerId !== "string" || !mongoose.isValidObjectId(customerId))) {
    throw createError("customerId must be valid", 400);
  }

  if (typeof metric !== "string" || !metric.trim()) {
    throw createError("metric is required", 400);
  }

  if (!periodValues.includes(period)) {
    throw createError("Invalid forecast period", 400);
  }

  if (forecastDate === undefined || Number.isNaN(new Date(forecastDate).getTime())) {
    throw createError("forecastDate must be a valid date", 400);
  }

  if (typeof predictedValue !== "number" || !Number.isFinite(predictedValue) || predictedValue < 0) {
    throw createError("predictedValue must be non-negative", 400);
  }

  if (currency !== undefined &&
    (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim()))) {
    throw createError("currency must be a valid 3-letter code", 400);
  }

  if (confidence !== undefined &&
    (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw createError("confidence must be between 0 and 1", 400);
  }

  for (const [field, value] of [["lowerBound", lowerBound], ["upperBound", upperBound]]) {
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw createError(`${field} must be non-negative`, 400);
    }
  }

  if (lowerBound !== undefined && upperBound !== undefined && lowerBound > upperBound) {
    throw createError("lowerBound cannot exceed upperBound", 400);
  }

  validateStringLength(metric, "metric", 200, { allowEmpty: false });
  validateStringLength(currency, "currency", 3);
  validateStringLength(body.source, "source", 200);
  validateStringLength(body.modelVersion, "modelVersion", 100);
}

export async function createForecast(req, res, next) {
  try {
    requireObjectBody(req.body);
    validateForecastFields(req.body);

    const {
      workspaceId,
      customerId,
      metric,
      period,
      forecastDate,
      predictedValue,
      currency,
      confidence,
      lowerBound,
      upperBound,
      source,
      modelVersion,
    } = req.body;

    const workspace = await Workspace.findOne({
      _id: workspaceId,
      ownerId: req.user.userId,
    });

    if (!workspace) {
      throw createError("Workspace access denied", 403);
    }

    if (customerId) {
      const customer = await Customer.findOne({
        _id: customerId,
        workspaceId: workspace._id,
      });

      if (!customer) {
        throw createError("Customer not found in workspace", 404);
      }
    }

    const forecast = await Forecast.create({
      workspaceId: workspace._id,
      customerId,
      metric: metric.trim(),
      period,
      forecastDate: new Date(forecastDate),
      predictedValue,
      currency: typeof currency === "string" ? currency.trim().toUpperCase() : currency,
      confidence,
      lowerBound,
      upperBound,
      source: typeof source === "string" ? source.trim() : source,
      modelVersion: typeof modelVersion === "string" ? modelVersion.trim() : modelVersion,
    });

    res.status(201).json({
      success: true,
      forecast: formatForecast(forecast),
    });
  } catch (error) {
    next(error);
  }
}

export async function getForecasts(req, res, next) {
  try {
    const { workspaceId } = req.query;

    if (typeof workspaceId !== "string" || !mongoose.isValidObjectId(workspaceId)) {
      throw createError("workspaceId is required", 400);
    }

    const workspace = await Workspace.findOne({
      _id: workspaceId,
      ownerId: req.user.userId,
    });

    if (!workspace) {
      throw createError("Workspace access denied", 403);
    }

    const pagination = parsePagination(req.query);
    const forecasts = await Forecast.find({ workspaceId: workspace._id })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ forecastDate: -1, createdAt: -1 })
      .lean();
    const currencySummary = summarizeForecastCurrencies(forecasts);

    res.json({
      success: true,
      currencyMode: currencySummary.currencyMode,
      currencies: currencySummary.currencies,
      forecasts: forecasts.map(formatForecast),
    });
  } catch (error) {
    next(error);
  }
}

export async function generateForecasts(req, res, next) {
  try {
    requireObjectBody(req.body);
    const { workspaceId } = req.body;

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

    const result = await generateWorkspaceForecasts(workspace._id);
    const currencySummary = summarizeForecastCurrencies(result.forecasts);

    res.json({
      success: true,
      currencyMode: currencySummary.currencyMode,
      currencies: currencySummary.currencies,
      forecasts: result.forecasts.map(formatForecast),
      generatedCount: result.forecasts.length,
      insufficientCurrencies: result.insufficientCurrencies,
      revenueEventCount: result.revenueEventCount,
    });
  } catch (error) {
    next(error);
  }
}
