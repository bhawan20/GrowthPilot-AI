import mongoose from "mongoose";

const forecastSchema = new mongoose.Schema(
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
    metric: {
      type: String,
      required: true,
      trim: true,
    },
    period: {
      type: String,
      required: true,
      enum: ["daily", "weekly", "monthly"],
    },
    forecastDate: {
      type: Date,
      required: true,
    },
    predictedValue: {
      type: Number,
      required: true,
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
    lowerBound: {
      type: Number,
      min: 0,
    },
    upperBound: {
      type: Number,
      min: 0,
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

forecastSchema.index(
  { workspaceId: 1, currency: 1, metric: 1, period: 1, forecastDate: 1, source: 1, modelVersion: 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: "revenue-history",
      modelVersion: "revenue-average-v1",
    },
  },
);

const Forecast = mongoose.model("Forecast", forecastSchema);

export default Forecast;
