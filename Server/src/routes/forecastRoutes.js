import { Router } from "express";
import {
  createForecast,
  generateForecasts,
  getForecasts,
} from "../controllers/forecastController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { expensiveRateLimit } from "../middleware/securityMiddleware.js";

const forecastRouter = Router();

forecastRouter.post("/", authenticateToken, createForecast);
forecastRouter.post("/generate", authenticateToken, expensiveRateLimit, generateForecasts);
forecastRouter.get("/", authenticateToken, getForecasts);

export default forecastRouter;
