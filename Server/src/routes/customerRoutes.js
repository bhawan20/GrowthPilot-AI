import { Router } from "express";
import {
  createCustomer,
  getCustomers,
} from "../controllers/customerController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const customerRouter = Router();

customerRouter.post("/", authenticateToken, createCustomer);
customerRouter.get("/", authenticateToken, getCustomers);

export default customerRouter;
