import { Router } from "express";
import { runIntelligence } from "../controllers/intelligenceController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { expensiveRateLimit } from "../middleware/securityMiddleware.js";

const intelligenceRouter = Router();

intelligenceRouter.post("/run", authenticateToken, expensiveRateLimit, runIntelligence);

export default intelligenceRouter;
