import mongoose from "mongoose";

const signalSchema = new mongoose.Schema(
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
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 1,
    },
    detectedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "resolved", "dismissed"],
    },
    source: {
      type: String,
      trim: true,
    },
    modelVersion: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

signalSchema.index(
  { workspaceId: 1, customerId: 1, type: 1, source: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "rule-engine",
      modelVersion: "phase-a-rules-v1",
    },
  },
);

const Signal = mongoose.model("Signal", signalSchema);

export default Signal;
