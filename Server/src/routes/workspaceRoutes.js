import { Router } from "express";
import {
  createWorkspace,
  getMyWorkspaces,
} from "../controllers/workspaceController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const workspaceRouter = Router();

workspaceRouter.post("/", authenticateToken, createWorkspace);
workspaceRouter.get("/", authenticateToken, getMyWorkspaces);

export default workspaceRouter;
