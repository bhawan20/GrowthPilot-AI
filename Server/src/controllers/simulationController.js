import mongoose from "mongoose";
import { runWorkspaceSimulation } from "../services/simulationService.js";
import Workspace from "../models/Workspace.js";
import { requireObjectBody } from "../utils/requestValidation.js";

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function runSimulation(req, res, next) {
  try {
    requireObjectBody(req.body);
    const { workspaceId, marketingBudget, discountPercent } = req.body;

    if (typeof workspaceId !== "string" || !mongoose.isValidObjectId(workspaceId)) {
      throw createError("workspaceId is required", 400);
    }

    if (typeof marketingBudget !== "number" || !Number.isFinite(marketingBudget) || marketingBudget < 0) {
      throw createError("marketingBudget must be a non-negative number", 400);
    }

    if (typeof discountPercent !== "number" || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      throw createError("discountPercent must be between 0 and 100", 400);
    }

    const workspace = await Workspace.findOne({
      _id: workspaceId,
      ownerId: req.user.userId,
    }).select("_id");

    if (!workspace) {
      throw createError("Workspace access denied", 403);
    }

    const result = await runWorkspaceSimulation(workspace._id, marketingBudget, discountPercent);

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}