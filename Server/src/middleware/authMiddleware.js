import jwt from "jsonwebtoken";
import { validateJwtSecret } from "./securityMiddleware.js";

export function authenticateToken(req, res, next) {
  const authorization = req.get("Authorization");
  const [scheme, token, ...extraParts] = (authorization || "").trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || extraParts.length > 0) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  try {
    validateJwtSecret();
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (!decoded || typeof decoded.userId !== "string") {
      throw new Error("Invalid token identity");
    }

    req.user = {
      userId: decoded.userId,
    };

    return next();
  } catch (_error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}
