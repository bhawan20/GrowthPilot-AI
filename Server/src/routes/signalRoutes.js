import { Router } from "express";
import {
  createSignal,
  getSignals,
  updateSignalStatus,
} from "../controllers/signalController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const signalRouter = Router();

signalRouter.post("/", authenticateToken, createSignal);
signalRouter.get("/", authenticateToken, getSignals);
signalRouter.patch("/:id/status", authenticateToken, updateSignalStatus);

export default signalRouter;
