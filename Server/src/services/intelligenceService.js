import Customer from "../models/Customer.js";
import Recommendation from "../models/Recommendation.js";
import RevenueEvent from "../models/RevenueEvent.js";
import Signal from "../models/Signal.js";

const GENERATED_SOURCE = "rule-engine";
const MODEL_VERSION = "phase-a-rules-v1";
const HIGH_CHURN_RISK = 0.7;
const LOW_ENGAGEMENT = 20;
const HIGH_GROWTH_POTENTIAL = 70;
const MINIMUM_DECLINE_EVENTS = 3;
const INACTIVITY_DAYS = 30;
const MINIMUM_INACTIVITY_EVENTS = 2;
const MAX_INTELLIGENCE_CUSTOMERS = 10000;
const MAX_INTELLIGENCE_REVENUE_EVENTS = 10000;

function clampScore(value) {
  return Math.max(0, Math.min(1, value));
}

function customerKey(customerId) {
  return customerId?.toString();
}

function latestEventsFirst(first, second) {
  return new Date(second.occurredAt) - new Date(first.occurredAt);
}

function oldestEventsFirst(first, second) {
  return new Date(first.occurredAt) - new Date(second.occurredAt);
}

function createCustomerSignal(workspaceId, customer, rule, fields) {
  return {
    workspaceId,
    customerId: customer._id,
    type: rule,
    source: GENERATED_SOURCE,
    modelVersion: MODEL_VERSION,
    detectedAt: new Date(),
    ...fields,
  };
}

async function upsertSignal(signal) {
  const { status, ...signalFields } = signal;

  const identity = {
    workspaceId: signal.workspaceId,
    customerId: signal.customerId,
    type: signal.type,
    source: GENERATED_SOURCE,
  };

  try {
    return await Signal.findOneAndUpdate(
      identity,
      {
        $set: signalFields,
        $setOnInsert: { status: status || "active" },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    return Signal.findOne(identity);
  }
}

async function upsertRecommendation(recommendation, signal) {
  const identity = {
    workspaceId: recommendation.workspaceId,
    customerId: recommendation.customerId,
    modelVersion: MODEL_VERSION,
    sourceSignalIds: signal._id,
  };

  try {
    return await Recommendation.findOneAndUpdate(
      identity,
      {
        $set: {
          ...recommendation,
          sourceSignalIds: [signal._id],
        },
        $setOnInsert: { status: "proposed" },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    return Recommendation.findOne(identity);
  }
}

function recommendationForSignal(signal, fields) {
  return {
    workspaceId: signal.workspaceId,
    customerId: signal.customerId,
    modelVersion: MODEL_VERSION,
    confidence: signal.score,
    priority: signal.type === "churn-risk" ? "high" : "medium",
    ...fields,
  };
}

export async function runWorkspaceIntelligence(workspaceId) {
  const [customerCount, revenueEventCount] = await Promise.all([
    Customer.countDocuments({ workspaceId }),
    RevenueEvent.countDocuments({ workspaceId }),
  ]);

  if (customerCount > MAX_INTELLIGENCE_CUSTOMERS || revenueEventCount > MAX_INTELLIGENCE_REVENUE_EVENTS) {
    const error = new Error("Workspace is too large for synchronous intelligence analysis");
    error.statusCode = 413;
    throw error;
  }

  const [customers, revenueEvents] = await Promise.all([
    Customer.find({ workspaceId }).lean(),
    RevenueEvent.find({ workspaceId }).sort({ occurredAt: -1 }).lean(),
  ]);

  const revenueByCustomer = new Map();
  for (const event of revenueEvents) {
    if (!event.customerId) continue;
    const key = customerKey(event.customerId);
    const eventsByCurrency = revenueByCustomer.get(key) || new Map();
    const currency = typeof event.currency === "string" ? event.currency.trim().toUpperCase() : null;
    const events = eventsByCurrency.get(currency) || [];
    events.push(event);
    eventsByCurrency.set(currency, events);
    revenueByCustomer.set(key, eventsByCurrency);
  }

  const lifetimeValuesByCurrency = new Map();
  for (const customer of customers) {
    if (typeof customer.lifetimeValue !== "number" || !Number.isFinite(customer.lifetimeValue) || customer.lifetimeValue <= 0) {
      continue;
    }

    const currency = typeof customer.currency === "string" ? customer.currency.trim().toUpperCase() : null;
    const values = lifetimeValuesByCurrency.get(currency) || [];
    values.push(customer.lifetimeValue);
    lifetimeValuesByCurrency.set(currency, values);
  }

  const medianLifetimeValueByCurrency = new Map();
  for (const [currency, values] of lifetimeValuesByCurrency) {
    values.sort((first, second) => first - second);
    medianLifetimeValueByCurrency.set(currency, values[Math.floor(values.length / 2)]);
  }

  const generatedSignals = [];
  const generatedRecommendations = [];
  const analysisDate = new Date();

  for (const customer of customers) {
    const riskScore = customer.churnRisk;
    const engagementScore = customer.engagementScore;
    const hasHighChurnRisk = typeof riskScore === "number" && riskScore >= HIGH_CHURN_RISK;
    const hasLowEngagement = typeof engagementScore === "number" && engagementScore <= LOW_ENGAGEMENT;

    if (hasHighChurnRisk || hasLowEngagement) {
      const score = hasHighChurnRisk
        ? riskScore
        : clampScore(1 - engagementScore / 100);
      const signal = await upsertSignal(
        createCustomerSignal(workspaceId, customer, "churn-risk", {
          description: hasHighChurnRisk
            ? `${customer.name} has a churn risk score of ${riskScore}.`
            : `${customer.name} has low engagement at ${engagementScore}%.`,
          score,
        }),
      );
      generatedSignals.push(signal);
      generatedRecommendations.push(
        await upsertRecommendation(
          recommendationForSignal(signal, {
            title: `Retain ${customer.name}`,
            rationale: signal.description,
            recommendedAction: "Review the account and create a targeted retention plan.",
            expectedImpact: customer.lifetimeValue,
            currency: customer.currency,
          }),
          signal,
        ),
      );
    }

    const hasHighGrowthPotential =
      typeof customer.growthPotential === "number" &&
      customer.growthPotential >= HIGH_GROWTH_POTENTIAL;
    const customerCurrency = typeof customer.currency === "string" ? customer.currency.trim().toUpperCase() : null;
    const medianLifetimeValue = medianLifetimeValueByCurrency.get(customerCurrency) || 0;
    const hasHighLifetimeValue =
      medianLifetimeValue > 0 &&
      typeof customer.lifetimeValue === "number" &&
      customer.lifetimeValue >= medianLifetimeValue;

    if (hasHighGrowthPotential || hasHighLifetimeValue) {
      const score = hasHighGrowthPotential
        ? clampScore(customer.growthPotential / 100)
        : clampScore(customer.lifetimeValue / medianLifetimeValue);
      const signal = await upsertSignal(
        createCustomerSignal(workspaceId, customer, "growth-opportunity", {
          description: hasHighGrowthPotential
            ? `${customer.name} has growth potential of ${customer.growthPotential}%.`
            : `${customer.name} is at or above the workspace median lifetime value.`,
          score,
        }),
      );
      generatedSignals.push(signal);
      generatedRecommendations.push(
        await upsertRecommendation(
          recommendationForSignal(signal, {
            title: `Expand ${customer.name}`,
            rationale: signal.description,
            recommendedAction: "Evaluate an upsell or expansion conversation.",
            expectedImpact: customer.lifetimeValue,
            currency: customer.currency,
          }),
          signal,
        ),
      );
    }

    const customerRevenueByCurrency = revenueByCustomer.get(customerKey(customer._id)) || new Map();
    for (const customerRevenueEvents of customerRevenueByCurrency.values()) {
      if (customerRevenueEvents.length < 2) {
        continue;
      }

      const [latestEvent, previousEvent] = [...customerRevenueEvents].sort(latestEventsFirst);
      if (latestEvent.amount > previousEvent.amount) {
        const signal = await upsertSignal(
          createCustomerSignal(workspaceId, customer, "revenue-growth", {
            description: `${customer.name}'s latest recorded revenue event is higher than the previous event.`,
            score: 1,
          }),
        );
        generatedSignals.push(signal);
        generatedRecommendations.push(
          await upsertRecommendation(
            recommendationForSignal(signal, {
              title: `Build on ${customer.name}'s revenue growth`,
              rationale: signal.description,
              recommendedAction: "Review the account for a timely expansion opportunity.",
              expectedImpact: latestEvent.amount,
              currency: latestEvent.currency,
            }),
            signal,
          ),
        );
      }

      const chronologicalRevenueEvents = [...customerRevenueEvents].sort(oldestEventsFirst);
      if (chronologicalRevenueEvents.length >= MINIMUM_DECLINE_EVENTS) {
        const recentEvents = chronologicalRevenueEvents.slice(-MINIMUM_DECLINE_EVENTS);
        const [firstEvent, secondEvent, latestEvent] = recentEvents;
        const hasConsecutiveDecline =
          secondEvent.amount < firstEvent.amount && latestEvent.amount < secondEvent.amount;

        if (hasConsecutiveDecline) {
          const declineScore = firstEvent.amount > 0
            ? clampScore((firstEvent.amount - latestEvent.amount) / firstEvent.amount)
            : 0;
          const signal = await upsertSignal(
            createCustomerSignal(workspaceId, customer, "revenue-decline", {
              description: `${customer.name}'s three most recent revenue events show two consecutive declines.`,
              score: declineScore,
            }),
          );
          generatedSignals.push(signal);
          generatedRecommendations.push(
            await upsertRecommendation(
              recommendationForSignal(signal, {
                title: `Address ${customer.name}'s revenue decline`,
                rationale: signal.description,
                recommendedAction: "Review the account for the cause of the decline and plan a recovery action.",
                expectedImpact: latestEvent.amount,
                currency: latestEvent.currency,
              }),
              signal,
            ),
          );
        }
      }

      if (customerRevenueEvents.length >= MINIMUM_INACTIVITY_EVENTS) {
        const [latestEvent] = [...customerRevenueEvents].sort(latestEventsFirst);
        const daysSinceLatestRevenue =
          (analysisDate.getTime() - new Date(latestEvent.occurredAt).getTime()) / (24 * 60 * 60 * 1000);

        if (daysSinceLatestRevenue >= INACTIVITY_DAYS) {
          const signal = await upsertSignal(
            createCustomerSignal(workspaceId, customer, "revenue-inactivity", {
              description: `${customer.name} has had no recorded revenue activity for at least ${INACTIVITY_DAYS} days.`,
              score: clampScore(daysSinceLatestRevenue / (INACTIVITY_DAYS * 3)),
            }),
          );
          generatedSignals.push(signal);
          generatedRecommendations.push(
            await upsertRecommendation(
              recommendationForSignal(signal, {
                title: `Re-engage ${customer.name}`,
                rationale: signal.description,
                recommendedAction: "Review the account and create a timely re-engagement plan.",
                expectedImpact: customer.lifetimeValue,
                currency: customer.currency,
              }),
              signal,
            ),
          );
        }
      }
    }
  }

  const generatedSignalKeys = generatedSignals.map((signal) => ({
    customerId: signal.customerId,
    type: signal.type,
  }));
  const staleSignalFilter = {
    workspaceId,
    source: GENERATED_SOURCE,
    modelVersion: MODEL_VERSION,
    status: "active",
    $nor: generatedSignalKeys.length
      ? generatedSignalKeys.map((key) => ({ customerId: key.customerId, type: key.type }))
      : [{ _id: { $exists: true } }],
  };
  const staleSignals = await Signal.find(staleSignalFilter).select("_id").lean();
  const staleSignalIds = staleSignals.map((signal) => signal._id);

  if (staleSignalIds.length) {
    await Signal.updateMany(
      { _id: { $in: staleSignalIds }, workspaceId, source: GENERATED_SOURCE, modelVersion: MODEL_VERSION, status: "active" },
      { $set: { status: "resolved" } },
    );
    await Recommendation.updateMany(
      { workspaceId, modelVersion: MODEL_VERSION, sourceSignalIds: { $in: staleSignalIds }, status: "proposed" },
      { $set: { status: "rejected" } },
    );
  }

  return {
    signals: generatedSignals,
    recommendations: generatedRecommendations,
  };
}

export {
  GENERATED_SOURCE,
  INACTIVITY_DAYS,
  MINIMUM_DECLINE_EVENTS,
  MINIMUM_INACTIVITY_EVENTS,
  MAX_INTELLIGENCE_CUSTOMERS,
  MAX_INTELLIGENCE_REVENUE_EVENTS,
  MODEL_VERSION,
};
