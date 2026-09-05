import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Signal from "../models/Signal.js";
import Workspace from "../models/Workspace.js";
import { parsePagination, requireObjectBody, validateStringLength } from "../utils/requestValidation.js";

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatSignal(signal) {
  return {
    id: signal._id.toString(),
    workspaceId: signal.workspaceId.toString(),
    customerId: signal.customerId?.toString(),
    type: signal.type,
    description: signal.description,
    score: signal.score,
    detectedAt: signal.detectedAt,
    status: signal.status,
    source: signal.source,
    modelVersion: signal.modelVersion,
    createdAt: signal.createdAt,
    updatedAt: signal.updatedAt,
  };
}

function validateSignalFields(body) {
  const { workspaceId, customerId, type, description, score, detectedAt, status } = body;

  if (
    typeof workspaceId !== "string" ||
    !mongoose.isValidObjectId(workspaceId)
  ) {
    throw createError("workspaceId is required", 400);
  }

  if (typeof type !== "string" || !type.trim()) {
    throw createError("type is required", 400);
  }

  if (typeof description !== "string" || !description.trim()) {
    throw createError("description is required", 400);
  }

  if (
    score !== undefined &&
    (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1)
  ) {
    throw createError("score must be between 0 and 1", 400);
  }

  if (
    detectedAt !== undefined &&
    Number.isNaN(new Date(detectedAt).getTime())
  ) {
    throw createError("detectedAt must be a valid date", 400);
  }

  if (
    status !== undefined &&
    !["active", "resolved", "dismissed"].includes(status)
  ) {
    throw createError("Invalid signal status", 400);
  }

  if (
    customerId !== undefined &&
    (typeof customerId !== "string" || !mongoose.isValidObjectId(customerId))
  ) {
    throw createError("customerId must be valid", 400);
  }

  validateStringLength(type, "type", 100, { allowEmpty: false });
  validateStringLength(description, "description", 1000, { allowEmpty: false });
  validateStringLength(body.source, "source", 200);
  validateStringLength(body.modelVersion, "modelVersion", 100);
}

export async function createSignal(req, res, next) {
  try {
    requireObjectBody(req.body);
    validateSignalFields(req.body);

    const {
      workspaceId,
      customerId,
      type,
      description,
      score,
      detectedAt,
      status,
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

    const signal = await Signal.create({
      workspaceId: workspace._id,
      customerId,
      type: type.trim(),
      description: description.trim(),
      score,
      detectedAt,
      status,
      source: typeof source === "string" ? source.trim() : source,
      modelVersion: typeof modelVersion === "string" ? modelVersion.trim() : modelVersion,
    });

    res.status(201).json({
      success: true,
      signal: formatSignal(signal),
    });
  } catch (error) {
    next(error);
  }
}

export async function getSignals(req, res, next) {
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
    const signals = await Signal.find({ workspaceId: workspace._id })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ detectedAt: -1 })
      .lean();

    res.json({
      success: true,
      signals: signals.map(formatSignal),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSignalStatus(req, res, next) {
  try {
    requireObjectBody(req.body);
    const { id } = req.params;
    const { status } = req.body;
    const statusValues = ["active", "resolved", "dismissed"];

    if (!mongoose.isValidObjectId(id)) {
      throw createError("Invalid signal ID", 400);
    }

    if (!status) {
      throw createError("Signal status is required", 400);
    }

    if (!statusValues.includes(status)) {
      throw createError("Invalid signal status", 400);
    }

    const signal = await Signal.findById(id).select("workspaceId");

    if (!signal) {
      throw createError("Signal not found", 404);
    }

    const workspace = await Workspace.findOne({
      _id: signal.workspaceId,
      ownerId: req.user.userId,
    }).select("_id");

    if (!workspace) {
      throw createError("Workspace access denied", 403);
    }

    const updatedSignal = await Signal.findOneAndUpdate(
      { _id: signal._id, workspaceId: workspace._id },
      { $set: { status } },
      { new: true, runValidators: true },
    ).lean();

    res.json({
      success: true,
      signal: formatSignal(updatedSignal),
    });
  } catch (error) {
    next(error);
  }
}
