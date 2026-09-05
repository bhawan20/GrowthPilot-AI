import mongoose from "mongoose";
import Workspace from "../models/Workspace.js";
import { parsePagination, requireObjectBody, validateStringLength } from "../utils/requestValidation.js";

function formatWorkspace(workspace) {
  return {
    id: workspace._id.toString(),
    name: workspace.name,
    ownerId: workspace.ownerId.toString(),
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

export async function createWorkspace(req, res, next) {
  try {
    requireObjectBody(req.body);
    const { name } = req.body;
    validateStringLength(name, "name", 200, { allowEmpty: false });

    if (typeof name !== "string" || !name.trim()) {
      const error = new Error("Workspace name is required");
      error.statusCode = 400;
      throw error;
    }

    const workspace = await Workspace.create({
      name: name.trim(),
      ownerId: req.user.userId,
    });

    res.status(201).json({
      success: true,
      workspace: formatWorkspace(workspace),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyWorkspaces(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.user.userId)) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      throw error;
    }

    const pagination = parsePagination(req.query);
    const workspaces = await Workspace.find({ ownerId: req.user.userId })
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      workspaces: workspaces.map(formatWorkspace),
    });
  } catch (error) {
    next(error);
  }
}
