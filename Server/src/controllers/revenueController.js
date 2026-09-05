import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import RevenueEvent from "../models/RevenueEvent.js";
import Workspace from "../models/Workspace.js";
import { parsePagination, requireObjectBody, validateStringLength } from "../utils/requestValidation.js";

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatRevenueEvent(revenueEvent) {
  return {
    id: revenueEvent._id.toString(),
    workspaceId: revenueEvent.workspaceId.toString(),
    customerId: revenueEvent.customerId?.toString(),
    amount: revenueEvent.amount,
    currency: revenueEvent.currency,
    occurredAt: revenueEvent.occurredAt,
    productOrSegment: revenueEvent.productOrSegment,
    source: revenueEvent.source,
    externalTransactionId: revenueEvent.externalTransactionId,
    createdAt: revenueEvent.createdAt,
    updatedAt: revenueEvent.updatedAt,
  };
}

function validateRevenueEventFields(body) {
  const {
    workspaceId,
    customerId,
    amount,
    currency,
    occurredAt,
    productOrSegment,
    source,
    externalTransactionId,
  } = body;

  if (typeof workspaceId !== "string" || !mongoose.isValidObjectId(workspaceId)) {
    throw createError("workspaceId is required", 400);
  }

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw createError("amount must be a non-negative number", 400);
  }

  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency.trim())) {
    throw createError("currency must be a valid 3-letter code", 400);
  }

  if (occurredAt === undefined || Number.isNaN(new Date(occurredAt).getTime())) {
    throw createError("occurredAt must be a valid date", 400);
  }

  if (customerId !== undefined && (typeof customerId !== "string" || !mongoose.isValidObjectId(customerId))) {
    throw createError("customerId must be valid", 400);
  }

  validateStringLength(productOrSegment, "productOrSegment", 200);
  validateStringLength(source, "source", 200);
  validateStringLength(externalTransactionId, "externalTransactionId", 200);
}

export async function createRevenueEvent(req, res, next) {
  try {
    requireObjectBody(req.body);
    validateRevenueEventFields(req.body);

    const {
      workspaceId,
      customerId,
      amount,
      currency,
      occurredAt,
      productOrSegment,
      source,
      externalTransactionId,
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

    if (externalTransactionId?.trim()) {
      const existingRevenueEvent = await RevenueEvent.findOne({
        workspaceId: workspace._id,
        externalTransactionId: externalTransactionId.trim(),
      });

      if (existingRevenueEvent) {
        throw createError("Revenue event already exists", 409);
      }
    }

    const revenueEvent = await RevenueEvent.create({
      workspaceId: workspace._id,
      customerId,
      amount,
      currency: currency.trim().toUpperCase(),
      occurredAt: new Date(occurredAt),
      productOrSegment: typeof productOrSegment === "string" ? productOrSegment.trim() : productOrSegment,
      source: typeof source === "string" ? source.trim() : source,
      externalTransactionId: typeof externalTransactionId === "string" ? externalTransactionId.trim() : externalTransactionId,
    });

    res.status(201).json({
      success: true,
      revenueEvent: formatRevenueEvent(revenueEvent),
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "Revenue event already exists";
    }

    next(error);
  }
}

export async function getRevenueEvents(req, res, next) {
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
    const revenueEvents = await RevenueEvent.find({ workspaceId: workspace._id })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ occurredAt: -1 })
      .lean();

    res.json({
      success: true,
      revenueEvents: revenueEvents.map(formatRevenueEvent),
    });
  } catch (error) {
    next(error);
  }
}
