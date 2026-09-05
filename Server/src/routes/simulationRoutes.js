import { Router } from "express";
import { runSimulation } from "../controllers/simulationController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { expensiveRateLimit } from "../middleware/securityMiddleware.js";

const simulationRouter = Router();

simulationRouter.post("/run", authenticateToken, expensiveRateLimit, runSimulation);

export default simulationRouter;