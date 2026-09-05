import cors from "cors";
import express from "express";
import analyticsRouter from "./routes/analyticsRoutes.js";
import authRouter from "./routes/authRoutes.js";
import customerRouter from "./routes/customerRoutes.js";
import decisionCenterRouter from "./routes/decisionCenterRoutes.js";
import forecastRouter from "./routes/forecastRoutes.js";
import healthRouter from "./routes/healthRoutes.js";
import intelligenceRouter from "./routes/intelligenceRoutes.js";
import revenueRouter from "./routes/revenueRoutes.js";
import recommendationRouter from "./routes/recommendationRoutes.js";
import signalRouter from "./routes/signalRoutes.js";
import simulationRouter from "./routes/simulationRoutes.js";
import workspaceRouter from "./routes/workspaceRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorMiddleware.js";
import { securityHeaders } from "./middleware/securityMiddleware.js";

const app = express();

app.use(securityHeaders);
app.use(express.json({ limit: "100kb" }));
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
  }),
);

app.use("/api", healthRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/auth", authRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/customers", customerRouter);
app.use("/api/decision-center", decisionCenterRouter);
app.use("/api/intelligence", intelligenceRouter);
app.use("/api/forecasts", forecastRouter);
app.use("/api/revenue", revenueRouter);
app.use("/api/recommendations", recommendationRouter);
app.use("/api/signals", signalRouter);
app.use("/api/simulations", simulationRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
