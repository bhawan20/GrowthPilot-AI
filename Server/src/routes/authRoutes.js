import { Router } from "express";
import {
	getCurrentUser,
	loginUser,
	registerUser,
} from "../controllers/authController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authRateLimit } from "../middleware/securityMiddleware.js";

const authRouter = Router();

authRouter.post("/register", authRateLimit, registerUser);
authRouter.post("/login", authRateLimit, loginUser);
authRouter.get("/me", authenticateToken, getCurrentUser);

export default authRouter;
