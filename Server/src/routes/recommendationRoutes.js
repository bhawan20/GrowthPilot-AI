import { Router } from "express";
import {
  createRecommendation,
  getRecommendations,
  updateRecommendationStatus,
} from "../controllers/recommendationController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const recommendationRouter = Router();

recommendationRouter.post("/", authenticateToken, createRecommendation);
recommendationRouter.get("/", authenticateToken, getRecommendations);
recommendationRouter.patch(
  "/:id/status",
  authenticateToken,
  updateRecommendationStatus,
);

export default recommendationRouter;
