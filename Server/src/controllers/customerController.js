import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Workspace from "../models/Workspace.js";
import { parsePagination, requireObjectBody, validateStringLength } from "../utils/requestValidation.js";

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatCustomer(customer) {
  return {
    id: customer._id.toString(),
    workspaceId: customer.workspaceId.toString(),
    name: customer.name,
    externalCustomerId: customer.externalCustomerId,
    segment: customer.segment,
    lifetimeValue: customer.lifetimeValue,
    currency: customer.currency,
    engagementScore: customer.engagementScore,
    churnRisk: customer.churnRisk,
    growthPotential: customer.growthPotential,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

function validateCustomerFields(body) {
  const {
    workspaceId,
    name,
    externalCustomerId,
    segment,
    lifetimeValue,
    currency,
    engagementScore,
    churnRisk,
    growthPotential,
  } = body;

  if (
    typeof workspaceId !== "string" ||
    !mongoose.isValidObjectId(workspaceId) ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof externalCustomerId !== "string" ||
    !externalCustomerId.trim()
  ) {
    throw createError(
      "workspaceId, name, and externalCustomerId are required",
      400,
    );
  }

  validateStringLength(name, "name", 200, { allowEmpty: false });
  validateStringLength(externalCustomerId, "externalCustomerId", 200, { allowEmpty: false });
  validateStringLength(segment, "segment", 200);
  validateStringLength(currency, "currency", 3);
  if (currency !== undefined && !/^[A-Za-z]{3}$/.test(currency.trim())) {
    throw createError("currency must be a valid 3-letter code", 400);
  }

  const numericFields = [
    ["lifetimeValue", lifetimeValue, (value) => value >= 0],
    ["engagementScore", engagementScore, (value) => value >= 0 && value <= 100],
    ["churnRisk", churnRisk, (value) => value >= 0 && value <= 1],
    ["growthPotential", growthPotential, (value) => value >= 0 && value <= 100],
  ];

  for (const [field, value, isValid] of numericFields) {
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || !isValid(value))) {
      throw createError(`Invalid ${field}`, 400);
    }
  }
}

export async function createCustomer(req, res, next) {
  try {
    requireObjectBody(req.body);
    validateCustomerFields(req.body);

    const { workspaceId, name, externalCustomerId, segment, lifetimeValue, currency, engagementScore, churnRisk, growthPotential } = req.body;
    const workspace = await Workspace.findOne({
      _id: workspaceId,
      ownerId: req.user.userId,
    });

    if (!workspace) {
      throw createError("Workspace access denied", 403);
    }

    const customer = await Customer.create({
      workspaceId: workspace._id,
      name: name.trim(),
      externalCustomerId: externalCustomerId.trim(),
      segment: typeof segment === "string" ? segment.trim() : segment,
      lifetimeValue,
      currency: typeof currency === "string" ? currency.trim().toUpperCase() : currency,
      engagementScore,
      churnRisk,
      growthPotential,
    });

    res.status(201).json({
      success: true,
      customer: formatCustomer(customer),
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "Customer already exists";
    }

    next(error);
  }
}

export async function getCustomers(req, res, next) {
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
    const customers = await Customer.find({ workspaceId: workspace._id })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      customers: customers.map(formatCustomer),
    });
  } catch (error) {
    next(error);
  }
}
