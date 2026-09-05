import { Router } from "express";
import {
  getForecastAnalytics,
  getOverviewAnalytics,
  getRecommendationAnalytics,
  getRevenueAnalytics,
  getSignalAnalytics,
} from "../controllers/analyticsController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const analyticsRouter = Router();

analyticsRouter.get("/overview", authenticateToken, getOverviewAnalytics);
analyticsRouter.get("/revenue", authenticateToken, getRevenueAnalytics);
analyticsRouter.get("/signals", authenticateToken, getSignalAnalytics);
analyticsRouter.get(
  "/recommendations",
  authenticateToken,
  getRecommendationAnalytics,
);
analyticsRouter.get("/forecasts", authenticateToken, getForecastAnalytics);

export default analyticsRouter;
