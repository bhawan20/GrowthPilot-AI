import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Recommendation from "../models/Recommendation.js";
import Signal from "../models/Signal.js";
import Workspace from "../models/Workspace.js";
import { parsePagination, requireObjectBody, validateStringLength } from "../utils/requestValidation.js";

const priorityValues = ["low", "medium", "high", "critical"];
const statusValues = ["pending", "proposed", "accepted", "rejected", "completed"];

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatRecommendation(recommendation) {
  return {
    id: recommendation._id.toString(),
    workspaceId: recommendation.workspaceId.toString(),
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

function validateRecommendationFields(body) {
  const {
    workspaceId,
    customerId,
    title,
    rationale,
    recommendedAction,
    expectedImpact,
    currency,
    confidence,
    priority,
    status,
    sourceSignalIds,
  } = body;

  if (typeof workspaceId !== "string" || !mongoose.isValidObjectId(workspaceId)) {
    throw createError("workspaceId is required", 400);
  }

  if (typeof title !== "string" || !title.trim()) {
    throw createError("title is required", 400);
  }

  if (typeof rationale !== "string" || !rationale.trim()) {
    throw createError("rationale is required", 400);
  }

  if (typeof recommendedAction !== "string" || !recommendedAction.trim()) {
    throw createError("recommendedAction is required", 400);
  }

  if (
    customerId !== undefined &&
    (typeof customerId !== "string" || !mongoose.isValidObjectId(customerId))
  ) {
    throw createError("customerId must be valid", 400);
  }

  if (
    expectedImpact !== undefined &&
    (typeof expectedImpact !== "number" ||
      !Number.isFinite(expectedImpact) ||
      expectedImpact < 0)
  ) {
    throw createError("expectedImpact must be non-negative", 400);
  }

  if (
    currency !== undefined &&
    (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim()))
  ) {
    throw createError("currency must be a valid 3-letter code", 400);
  }

  if (
    confidence !== undefined &&
    (typeof confidence !== "number" ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1)
  ) {
    throw createError("confidence must be between 0 and 1", 400);
  }

  if (priority !== undefined && !priorityValues.includes(priority)) {
    throw createError("Invalid recommendation priority", 400);
  }

  if (status !== undefined && !statusValues.includes(status)) {
    throw createError("Invalid recommendation status", 400);
  }

  if (sourceSignalIds !== undefined) {
    if (
      !Array.isArray(sourceSignalIds) ||
      sourceSignalIds.some(
        (signalId) =>
          typeof signalId !== "string" || !mongoose.isValidObjectId(signalId),
      )
    ) {
      throw createError("sourceSignalIds must contain valid IDs", 400);
    }
    if (sourceSignalIds.length > 50 || new Set(sourceSignalIds).size !== sourceSignalIds.length) {
      throw createError("sourceSignalIds is invalid", 400);
    }
  }

  validateStringLength(title, "title", 200, { allowEmpty: false });
  validateStringLength(rationale, "rationale", 2000, { allowEmpty: false });
  validateStringLength(recommendedAction, "recommendedAction", 1000, { allowEmpty: false });
  validateStringLength(currency, "currency", 3);
  validateStringLength(body.modelVersion, "modelVersion", 100);
}

async function verifySourceSignals(sourceSignalIds, workspaceId) {
  if (!sourceSignalIds?.length) {
    return;
  }

  const signals = await Signal.find({
    _id: { $in: sourceSignalIds },
    workspaceId,
  }).select("_id");

  if (signals.length !== new Set(sourceSignalIds).size) {
    throw createError("Source signal not found in workspace", 404);
  }
}

export async function createRecommendation(req, res, next) {
  try {
    requireObjectBody(req.body);
    validateRecommendationFields(req.body);

    const {
      workspaceId,
      customerId,
      title,
      rationale,
      recommendedAction,
      expectedImpact,
      currency,
      confidence,
      priority,
      status,
      sourceSignalIds,
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

    await verifySourceSignals(sourceSignalIds, workspace._id);

    const recommendation = await Recommendation.create({
      workspaceId: workspace._id,
      customerId,
      title: title.trim(),
      rationale: rationale.trim(),
      recommendedAction: recommendedAction.trim(),
      expectedImpact,
      currency: typeof currency === "string" ? currency.trim().toUpperCase() : currency,
      confidence,
      priority,
      status,
      sourceSignalIds,
      modelVersion: typeof modelVersion === "string" ? modelVersion.trim() : modelVersion,
    });

    res.status(201).json({
      success: true,
      recommendation: formatRecommendation(recommendation),
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecommendations(req, res, next) {
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
    const recommendations = await Recommendation.find({ workspaceId: workspace._id })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      recommendations: recommendations.map(formatRecommendation),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateRecommendationStatus(req, res, next) {
  try {
    requireObjectBody(req.body);
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      throw createError("Invalid recommendation ID", 400);
    }

    if (!statusValues.includes(status)) {
      throw createError("Invalid recommendation status", 400);
    }

    const recommendation = await Recommendation.findById(id).select("workspaceId");

    if (!recommendation) {
      throw createError("Recommendation not found", 404);
    }

    const workspace = await Workspace.findOne({
      _id: recommendation.workspaceId,
      ownerId: req.user.userId,
    });

    if (!workspace) {
      throw createError("Workspace access denied", 403);
    }

    const updatedRecommendation = await Recommendation.findOneAndUpdate(
      { _id: recommendation._id, workspaceId: workspace._id },
      { $set: { status } },
      { new: true, runValidators: true },
    ).lean();

    res.json({
      success: true,
      recommendation: formatRecommendation(updatedRecommendation),
    });
  } catch (error) {
    next(error);
  }
}
