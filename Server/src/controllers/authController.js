import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import { requireObjectBody, validateStringLength } from "../utils/requestValidation.js";

export async function registerUser(req, res, next) {
  try {
    requireObjectBody(req.body);
    const { name, email, password } = req.body;

    validateStringLength(name, "name", 200, { allowEmpty: false });
    validateStringLength(email, "email", 320, { allowEmpty: false });
    validateStringLength(password, "password", 200, { allowEmpty: false });

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !password ||
      password.length < 6
    ) {
      const error = new Error("Name, email, and password are required; password must be at least 6 characters");
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      const error = new Error("A user with this email already exists");
      error.statusCode = 409;
      throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "A user with this email already exists";
    }

    next(error);
  }
}

export async function loginUser(req, res, next) {
  try {
    requireObjectBody(req.body);
    const { email, password } = req.body;

    validateStringLength(email, "email", 320, { allowEmpty: false });
    validateStringLength(password, "password", 200, { allowEmpty: false });

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      const error = new Error("Email and password are required");
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    const invalidCredentials = new Error("Invalid email or password");
    invalidCredentials.statusCode = 401;

    if (!user) {
      throw invalidCredentials;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      throw invalidCredentials;
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT secret is not configured");
    }

    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "7d" },
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.user.userId)) {
      const error = new Error("Authenticated user not found");
      error.statusCode = 401;
      throw error;
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      const error = new Error("Authenticated user not found");
      error.statusCode = 401;
      throw error;
    }

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
}
