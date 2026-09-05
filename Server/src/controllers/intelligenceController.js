import mongoose from "mongoose";
import Workspace from "../models/Workspace.js";
import { runWorkspaceIntelligence } from "../services/intelligenceService.js";
import { requireObjectBody } from "../utils/requestValidation.js";

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export async function runIntelligence(req, res, next) {
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

    const result = await runWorkspaceIntelligence(workspace._id);

    res.json({
      success: true,
      workspaceId: workspace._id.toString(),
      generatedOrUpdatedSignals: result.signals.length,
      generatedOrUpdatedRecommendations: result.recommendations.length,
    });
  } catch (error) {
    next(error);
  }
}
