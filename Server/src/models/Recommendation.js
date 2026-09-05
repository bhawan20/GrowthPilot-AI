import mongoose from "mongoose";

const recommendationSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    rationale: {
      type: String,
      required: true,
      trim: true,
    },
    recommendedAction: {
      type: String,
      required: true,
      trim: true,
    },
    expectedImpact: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
    },
    status: {
      type: String,
      enum: ["pending", "proposed", "accepted", "rejected", "completed"],
    },
    sourceSignalIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Signal",
      },
    ],
    modelVersion: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

recommendationSchema.index(
  { workspaceId: 1, customerId: 1, modelVersion: 1, sourceSignalIds: 1 },
  {
    unique: true,
    partialFilterExpression: {
      modelVersion: "phase-a-rules-v1",
      "sourceSignalIds.0": { $exists: true },
    },
  },
);

const Recommendation = mongoose.model("Recommendation", recommendationSchema);

export default Recommendation;
