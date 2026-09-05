import { Router } from "express";
import {
  getDecisionCenter,
  getDecisionCenterForecasts,
  getDecisionCenterRecommendations,
  getDecisionCenterSignals,
} from "../controllers/decisionCenterController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const decisionCenterRouter = Router();

decisionCenterRouter.get("/", authenticateToken, getDecisionCenter);
decisionCenterRouter.get(
  "/recommendations",
  authenticateToken,
  getDecisionCenterRecommendations,
);
decisionCenterRouter.get("/signals", authenticateToken, getDecisionCenterSignals);
decisionCenterRouter.get(
  "/forecasts",
  authenticateToken,
  getDecisionCenterForecasts,
);

export default decisionCenterRouter;
