import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    externalCustomerId: {
      type: String,
      required: true,
      trim: true,
    },
    segment: {
      type: String,
      trim: true,
    },
    lifetimeValue: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      trim: true,
    },
    engagementScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    churnRisk: {
      type: Number,
      min: 0,
      max: 1,
    },
    growthPotential: {
      type: Number,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

customerSchema.index({ workspaceId: 1, externalCustomerId: 1 }, { unique: true });

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;
