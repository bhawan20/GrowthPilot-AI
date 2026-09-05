import mongoose from "mongoose";

const revenueEventSchema = new mongoose.Schema(
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
    productOrSegment: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      trim: true,
    },
    externalTransactionId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

revenueEventSchema.index(
  { workspaceId: 1, externalTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalTransactionId: { $exists: true, $type: "string", $ne: "" },
    },
  },
);

const RevenueEvent = mongoose.model("RevenueEvent", revenueEventSchema);

export default RevenueEvent;
