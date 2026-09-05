import { Router } from "express";
import {
  createRevenueEvent,
  getRevenueEvents,
} from "../controllers/revenueController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const revenueRouter = Router();

revenueRouter.post("/", authenticateToken, createRevenueEvent);
revenueRouter.get("/", authenticateToken, getRevenueEvents);

export default revenueRouter;
