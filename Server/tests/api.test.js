import "dotenv/config";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Customer from "../src/models/Customer.js";
import Forecast from "../src/models/Forecast.js";
import Recommendation from "../src/models/Recommendation.js";
import RevenueEvent from "../src/models/RevenueEvent.js";
import Signal from "../src/models/Signal.js";
import User from "../src/models/User.js";

const apiBase = "http://127.0.0.1:5101/api";
const workspaceId = "6a9039b5205b04401b487b16";
const liveWorkspaceId = "6a8dcc96146baad2a90a9c2e";
const ownerId = "6a8dcba2146baad2a90a9c2d";
const ownerToken = jwt.sign({ userId: ownerId }, process.env.JWT_SECRET, { expiresIn: "1h" });
const otherUserToken = jwt.sign({ userId: "507f1f77bcf86cd799439011" }, process.env.JWT_SECRET, { expiresIn: "1h" });
const tracked = { users: [], customers: [], revenue: [], forecasts: [], signals: [], recommendations: [] };
const models = { users: User, customers: Customer, revenue: RevenueEvent, forecasts: Forecast, signals: Signal, recommendations: Recommendation };
let serverProcess;

async function counts(id) {
  const filter = { workspaceId: id };
  const values = await Promise.all([
    Customer.countDocuments(filter),
    RevenueEvent.countDocuments(filter),
    Forecast.countDocuments(filter),
    Signal.countDocuments(filter),
    Recommendation.countDocuments(filter),
  ]);
  return { customers: values[0], revenue: values[1], forecasts: values[2], signals: values[3], recommendations: values[4] };
}

async function request(path, { method = "GET", body, token = ownerToken } = {}) {
  const options = { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
  if (body !== undefined) options.body = JSON.stringify(body);
  const response = await fetch(`${apiBase}${path}`, options);
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function expectStatus(path, options, expectedStatus) {
  const result = await request(path, options);
  assert.equal(result.status, expectedStatus, `${path} returned ${result.status}: ${JSON.stringify(result.data)}`);
  return result;
}

function remember(type, id) {
  assert.ok(id, `Expected an ID for ${type}`);
  tracked[type].push(id);
  return id;
}

async function create(path, body, type, responseKey) {
  const result = await expectStatus(path, { method: "POST", body }, 201);
  remember(type, result.data[responseKey].id);
  return result.data[responseKey];
}

function revenueBody(currency, amount = 500, suffix = Math.random().toString(36).slice(2)) {
  return {
    workspaceId,
    amount,
    currency,
    occurredAt: "2026-09-01T00:00:00.000Z",
    source: "e2-test",
    externalTransactionId: `e2-${currency}-${suffix}`,
  };
}

function forecastBody(currency, metric = "revenue") {
  const body = {
    workspaceId,
    metric,
    period: "monthly",
    forecastDate: "2026-09-02T00:00:00.000Z",
    predictedValue: 1000,
    confidence: 0.9,
    lowerBound: 800,
    upperBound: 1200,
    source: "e2-test",
    modelVersion: "e2-test-v1",
  };
  if (currency !== undefined) body.currency = currency;
  return body;
}

function recommendationBody(currency) {
  return {
    workspaceId,
    title: `E2 recommendation ${currency ?? "missing"}`,
    rationale: "Automated contract test",
    recommendedAction: "Review the test recommendation",
    expectedImpact: 100,
    currency,
    confidence: 0.9,
    priority: "high",
    status: "proposed",
    modelVersion: "e2-test-v1",
  };
}

async function cleanupTracked() {
  for (const type of Object.keys(models)) {
    if (tracked[type].length) {
      await models[type].deleteMany({ _id: { $in: tracked[type] }, ...(type === "users" ? {} : { workspaceId }) });
    }
    tracked[type] = [];
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not become ready");
}

function startTestServer() {
  return spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: "5101" },
    stdio: "ignore",
  });
}

async function waitForProcessExit(processToWait, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      processToWait.kill();
      reject(new Error("Child process did not exit"));
    }, timeoutMs);
    processToWait.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  assert.deepEqual(await counts(workspaceId), { customers: 0, revenue: 0, forecasts: 0, signals: 0, recommendations: 0 });
  serverProcess = startTestServer();
  await waitForServer();
});

afterEach(async () => {
  await cleanupTracked();
  assert.deepEqual(await counts(workspaceId), { customers: 0, revenue: 0, forecasts: 0, signals: 0, recommendations: 0 });
});

after(async () => {
  await cleanupTracked();
  serverProcess?.kill();
  await mongoose.disconnect();
});

describe("authentication and workspace contracts", () => {
  test("registers, rejects duplicate email, logs in, and never returns a password", async () => {
    const email = `e2-${Date.now()}@example.test`;
    const registration = await create("/auth/register", { name: "E2 Test User", email, password: "correct-horse" }, "users", "user");
    assert.equal(registration.email, email);
    assert.equal("password" in registration, false);
    await expectStatus("/auth/register", { method: "POST", body: { name: "Duplicate", email, password: "correct-horse" } }, 409);
    const login = await expectStatus("/auth/login", { method: "POST", body: { email, password: "correct-horse" } }, 200);
    assert.ok(login.data.token);
    assert.equal("password" in login.data.user, false);
    await expectStatus("/auth/login", { method: "POST", body: { email, password: "wrong-password" } }, 401);
    await expectStatus("/auth/login", { method: "POST", body: { email: "missing@example.test", password: "correct-horse" } }, 401);
  });

  test("protects routes and enforces workspace ownership", async () => {
    await expectStatus(`/workspaces`, {}, 200);
    await expectStatus(`/workspaces`, { token: "" }, 401);
    await expectStatus(`/decision-center?workspaceId=${workspaceId}`, { token: otherUserToken }, 403);
    await expectStatus(`/customers?workspaceId=${liveWorkspaceId}`, { token: otherUserToken }, 403);
    await expectStatus(`/analytics/overview?workspaceId=${workspaceId}`, { token: ownerToken }, 200);
    const malformed = jwt.sign({ userId: ownerId }, process.env.JWT_SECRET, { expiresIn: "1h" }) + "broken";
    await expectStatus(`/workspaces`, { token: malformed }, 401);
  });

  test("rejects expired, wrong-secret, and unsupported-algorithm JWTs", async () => {
    const expired = jwt.sign({ userId: ownerId }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: -1 });
    const wrongSecret = jwt.sign({ userId: ownerId }, "different-test-secret", { algorithm: "HS256", expiresIn: "1h" });
    const unsupportedAlgorithm = jwt.sign({ userId: ownerId }, process.env.JWT_SECRET, { algorithm: "HS384", expiresIn: "1h" });
    await expectStatus("/workspaces", { token: expired }, 401);
    await expectStatus("/workspaces", { token: wrongSecret }, 401);
    await expectStatus("/workspaces", { token: unsupportedAlgorithm }, 401);
    await expectStatus("/workspaces", { token: ownerToken }, 200);
  });

  test("rate-limits login and registration independently", async () => {
    let loginLimited = false;
    for (let attempt = 0; attempt < 51; attempt += 1) {
      const result = await request("/auth/login", { method: "POST", body: { email: "missing@example.test", password: "wrong-password" } });
      if (result.status === 429) {
        loginLimited = true;
        assert.ok(result.data.message);
        assert.ok(result.data.success === false);
        break;
      }
    }
    assert.equal(loginLimited, true);

    let registerLimited = false;
    for (let attempt = 0; attempt < 51; attempt += 1) {
      const result = await request("/auth/register", { method: "POST", body: { name: "Rate test", email: `rate-${attempt}-${Date.now()}@example.test`, password: "correct-horse" } });
      if (result.status === 429) {
        registerLimited = true;
        break;
      }
      if (result.status === 201) remember("users", result.data.user.id);
    }
    assert.equal(registerLimited, true);
    serverProcess.kill();
    await waitForProcessExit(serverProcess);
    serverProcess = startTestServer();
    await waitForServer();
  });
});

describe("domain API contracts", () => {
  test("rejects null, array, and primitive bodies without a 500", async () => {
    const endpoints = [
      "/workspaces",
      "/customers",
      "/revenue",
      "/signals",
      "/forecasts",
      "/recommendations",
      "/intelligence/run",
      "/simulations/run",
    ];

    for (const endpoint of endpoints) {
      for (const body of [null, [], "invalid"]) {
        await expectStatus(endpoint, { method: "POST", body }, 400);
      }
    }

    await expectStatus("/auth/register", { method: "POST", body: null }, 400);
    await expectStatus("/auth/login", { method: "POST", body: [] }, 400);
  });

  test("normalizes valid customer currencies and rejects invalid values", async () => {
    const inr = await create("/customers", { workspaceId, name: "INR customer", externalCustomerId: "e2-inr", currency: "INR" }, "customers", "customer");
    const usd = await create("/customers", { workspaceId, name: "USD customer", externalCustomerId: "e2-usd", currency: "usd" }, "customers", "customer");
    assert.equal(inr.currency, "INR");
    assert.equal(usd.currency, "USD");
    for (const currency of ["", "IN", "USDD", "rupees"]) {
      await expectStatus("/customers", {
        method: "POST",
        body: { workspaceId, name: "Invalid currency", externalCustomerId: `e2-invalid-${currency || "empty"}`, currency },
      }, 400);
    }
  });

  test("maps Mongoose validation errors to 400", async () => {
    await expectStatus("/auth/register", {
      method: "POST",
      body: { name: "Short password", email: `e2-short-${Date.now()}@example.test`, password: "short" },
    }, 400);
  });

  test("returns controlled errors for malformed and nonexistent IDs", async () => {
    await expectStatus(`/customers?workspaceId=not-an-object-id`, {}, 400);
    await expectStatus("/revenue", {
      method: "POST",
      body: { ...revenueBody("INR", 10, "bad-customer"), customerId: "not-an-object-id" },
    }, 400);
    const signal = await create("/signals", { workspaceId, type: "e2-id", description: "ID test", status: "active" }, "signals", "signal");
    const recommendation = await create("/recommendations", recommendationBody("INR"), "recommendations", "recommendation");
    await expectStatus("/signals/not-an-object-id/status", { method: "PATCH", body: { status: "resolved" } }, 400);
    await expectStatus("/recommendations/not-an-object-id/status", { method: "PATCH", body: { status: "accepted" } }, 400);
    await expectStatus(`/signals/507f1f77bcf86cd799439011/status`, { method: "PATCH", body: { status: "resolved" } }, 404);
    await expectStatus(`/recommendations/507f1f77bcf86cd799439011/status`, { method: "PATCH", body: { status: "accepted" } }, 404);
    assert.ok(signal.id);
    assert.ok(recommendation.id);
  });

  test("supports bounded page and limit parameters on collection reads", async () => {
    await create("/customers", { workspaceId, name: "Paged customer", externalCustomerId: "e2-paged-customer" }, "customers", "customer");
    await create("/revenue", revenueBody("INR", 10, "paged"), "revenue", "revenueEvent");
    await create("/signals", { workspaceId, type: "e2-paged", description: "Paged signal" }, "signals", "signal");
    await create("/forecasts", forecastBody("INR", "e2-paged"), "forecasts", "forecast");
    await create("/recommendations", recommendationBody("INR"), "recommendations", "recommendation");
    const endpoints = ["/customers", "/revenue", "/signals", "/forecasts", "/recommendations"];
    for (const endpoint of endpoints) {
      const key = endpoint === "/customers" ? "customers" : endpoint === "/revenue" ? "revenueEvents" : endpoint.slice(1);
      const defaultResult = await expectStatus(`${endpoint}?workspaceId=${workspaceId}`, {}, 200);
      assert.ok(defaultResult.data[key].length <= 50);
      const limited = await expectStatus(`${endpoint}?workspaceId=${workspaceId}&limit=1&page=1`, {}, 200);
      assert.ok(limited.data[key].length <= 1);
      const maximum = await expectStatus(`${endpoint}?workspaceId=${workspaceId}&limit=101`, {}, 200);
      assert.ok(maximum.data[key].length <= 100);
      await expectStatus(`${endpoint}?workspaceId=${workspaceId}&limit=0`, {}, 400);
      await expectStatus(`${endpoint}?workspaceId=${workspaceId}&limit=not-number`, {}, 400);
      await expectStatus(`${endpoint}?workspaceId=${workspaceId}&page=0`, {}, 400);
      await expectStatus(`${endpoint}?workspaceId=${workspaceId}&page=not-number`, {}, 400);
    }
  });

  test("creates and lists customers with duplicate protection", async () => {
    const body = { workspaceId, name: "E2 customer", externalCustomerId: "e2-customer", lifetimeValue: 250, currency: "USD" };
    const customer = await create("/customers", body, "customers", "customer");
    assert.equal(customer.workspaceId, workspaceId);
    assert.equal(customer.currency, "USD");
    await expectStatus("/customers", { method: "POST", body }, 409);
    const list = await expectStatus(`/customers?workspaceId=${workspaceId}`, {}, 200);
    assert.equal(list.data.customers.length, 1);
  });

  test("creates revenue, rejects invalid input, and protects duplicate transactions", async () => {
    const body = revenueBody("INR", 750, "revenue");
    const event = await create("/revenue", body, "revenue", "revenueEvent");
    assert.equal(event.workspaceId, workspaceId);
    assert.equal(event.currency, "INR");
    await expectStatus("/revenue", { method: "POST", body }, 409);
    await expectStatus("/revenue", { method: "POST", body: { ...body, amount: -1, externalTransactionId: "invalid" } }, 400);
    const list = await expectStatus(`/revenue?workspaceId=${workspaceId}`, {}, 200);
    assert.equal(list.data.revenueEvents.length, 1);
  });

  test("creates signals and authorizes status updates", async () => {
    const signal = await create("/signals", { workspaceId, type: "e2-signal", description: "E2 signal", score: 0.8, status: "active" }, "signals", "signal");
    const list = await expectStatus(`/signals?workspaceId=${workspaceId}`, {}, 200);
    assert.equal(list.data.signals[0].id, signal.id);
    const updated = await expectStatus(`/signals/${signal.id}/status`, { method: "PATCH", body: { status: "resolved" } }, 200);
    assert.equal(updated.data.signal.status, "resolved");
    await expectStatus(`/signals/${signal.id}/status`, { method: "PATCH", body: { status: "dismissed" }, token: otherUserToken }, 403);
  });

  test("creates forecasts and recommendations with workspace validation", async () => {
    const forecast = await create("/forecasts", forecastBody("INR"), "forecasts", "forecast");
    assert.equal(forecast.currency, "INR");
    const signal = await create("/signals", { workspaceId, type: "e2-source", description: "Source signal", status: "active" }, "signals", "signal");
    const recommendation = await create("/recommendations", { ...recommendationBody("USD"), sourceSignalIds: [signal.id] }, "recommendations", "recommendation");
    assert.equal(recommendation.currency, "USD");
    const updated = await expectStatus(`/recommendations/${recommendation.id}/status`, { method: "PATCH", body: { status: "accepted" } }, 200);
    assert.equal(updated.data.recommendation.status, "accepted");
    await expectStatus("/recommendations", { method: "POST", body: { ...recommendationBody("USD"), sourceSignalIds: ["507f1f77bcf86cd799439011"] } }, 404);
    const forecasts = await expectStatus(`/forecasts?workspaceId=${workspaceId}`, {}, 200);
    assert.equal(forecasts.data.forecasts[0].id, forecast.id);
  });

  test("runs rule-based intelligence and returns generated records", async () => {
    const customer = await create("/customers", { workspaceId, name: "E2 risky customer", externalCustomerId: "e2-risky", lifetimeValue: 500, currency: "INR", churnRisk: 0.9 }, "customers", "customer");
    const result = await expectStatus("/intelligence/run", { method: "POST", body: { workspaceId } }, 200);
    assert.equal(result.data.workspaceId, workspaceId);
    const signals = await expectStatus(`/signals?workspaceId=${workspaceId}`, {}, 200);
    const recommendations = await expectStatus(`/recommendations?workspaceId=${workspaceId}`, {}, 200);
    signals.data.signals.forEach((item) => remember("signals", item.id));
    recommendations.data.recommendations.forEach((item) => remember("recommendations", item.id));
    assert.ok(signals.data.signals.some((item) => item.customerId === customer.id));
    assert.ok(recommendations.data.recommendations.some((item) => item.customerId === customer.id));
  });
});

describe("currency contracts", () => {
  test("preserves single INR and single USD analytics and Decision Center states", async () => {
    await create("/revenue", revenueBody("INR", 500, "inr"), "revenue", "revenueEvent");
    await create("/forecasts", forecastBody("INR"), "forecasts", "forecast");
    const inr = await expectStatus(`/analytics/overview?workspaceId=${workspaceId}`, {}, 200);
    assert.equal(inr.data.overview.revenue.currencyMode, "single");
    assert.equal(inr.data.overview.revenue.currency, "INR");
    const dc = await expectStatus(`/decision-center?workspaceId=${workspaceId}`, {}, 200);
    assert.deepEqual(dc.data.decisionCenter.currencies, ["INR"]);
    await cleanupTracked();
    await create("/revenue", revenueBody("USD", 500, "usd"), "revenue", "revenueEvent");
    await create("/forecasts", forecastBody("USD"), "forecasts", "forecast");
    const usd = await expectStatus(`/analytics/revenue?workspaceId=${workspaceId}`, {}, 200);
    assert.equal(usd.data.revenue.currency, "USD");
    const usdDc = await expectStatus(`/decision-center?workspaceId=${workspaceId}`, {}, 200);
    assert.deepEqual(usdDc.data.decisionCenter.currencies, ["USD"]);
  });

  test("keeps mixed currencies separate and blocks combined simulator scalars", async () => {
    for (const currency of ["INR", "USD"]) {
      await create("/revenue", revenueBody(currency, 500, `mixed-${currency}`), "revenue", "revenueEvent");
      await create("/forecasts", forecastBody(currency, currency), "forecasts", "forecast");
    }
    const analytics = await expectStatus(`/analytics/revenue?workspaceId=${workspaceId}`, {}, 200);
    assert.equal(analytics.data.revenue.currencyMode, "multiple");
    assert.equal(analytics.data.revenue.totalRevenue, null);
    assert.deepEqual(analytics.data.revenue.byCurrency.map((item) => item.currency).sort(), ["INR", "USD"]);
    const simulation = await expectStatus("/simulations/run", { method: "POST", body: { workspaceId, marketingBudget: 100, discountPercent: 10 } }, 200);
    assert.equal(simulation.data.requiresCurrencySelection, true);
    assert.equal(simulation.data.simulation.baselineRevenue, null);
  });

  test("does not use mismatched or missing forecast currency", async () => {
    await create("/revenue", revenueBody("INR", 500, "mismatch"), "revenue", "revenueEvent");
    await create("/forecasts", forecastBody("USD"), "forecasts", "forecast");
    let simulation = await expectStatus("/simulations/run", { method: "POST", body: { workspaceId, marketingBudget: 0, discountPercent: 0 } }, 200);
    assert.equal(simulation.data.baseline.forecastUsed.used, false);
    assert.equal(simulation.data.simulation.baselineRevenue, 500);
    await cleanupTracked();
    await create("/revenue", revenueBody("INR", 500, "missing"), "revenue", "revenueEvent");
    await create("/forecasts", forecastBody(undefined), "forecasts", "forecast");
    simulation = await expectStatus("/simulations/run", { method: "POST", body: { workspaceId, marketingBudget: 0, discountPercent: 0 } }, 200);
    assert.equal(simulation.data.baseline.forecastUsed.used, false);
    assert.equal(simulation.data.baseline.forecastUsed.currency, null);
  });

  test("returns safe none state for an empty workspace", async () => {
    const overview = await expectStatus(`/analytics/overview?workspaceId=${workspaceId}`, {}, 200);
    const revenue = await expectStatus(`/analytics/revenue?workspaceId=${workspaceId}`, {}, 200);
    const forecasts = await expectStatus(`/analytics/forecasts?workspaceId=${workspaceId}`, {}, 200);
    const decisionCenter = await expectStatus(`/decision-center?workspaceId=${workspaceId}`, {}, 200);
    const simulation = await expectStatus("/simulations/run", { method: "POST", body: { workspaceId, marketingBudget: 0, discountPercent: 0 } }, 200);
    assert.equal(overview.data.overview.revenue.currencyMode, "none");
    assert.equal(revenue.data.revenue.currencyMode, "none");
    assert.equal(forecasts.data.forecasts.currencyMode, "none");
    assert.equal(decisionCenter.data.decisionCenter.currencyMode, "none");
    assert.equal(simulation.data.currencyMode, "none");
  });
});

describe("security middleware", () => {
  test("fails startup when JWT_SECRET is empty", async () => {
    const child = spawn(process.execPath, ["src/server.js"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, JWT_SECRET: "", PORT: "5102" },
      stdio: "ignore",
    });
    const result = await waitForProcessExit(child);
    assert.equal(result.code, 1);
  });

  test("returns security headers and preserves non-wildcard CORS", async () => {
    const response = await fetch(`${apiBase}/health`, { headers: { Origin: "http://malicious.example" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.notEqual(response.headers.get("access-control-allow-origin"), "*");
    assert.notEqual(response.headers.get("access-control-allow-origin"), "http://malicious.example");
  });

  test("rejects oversized JSON bodies with a controlled 400", async () => {
    const response = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "large@example.test", password: "x".repeat(110000) }),
    });
    const data = await response.json();
    assert.equal(response.status, 400);
    assert.equal(data.success, false);
    assert.equal(data.message, "Request body is invalid or too large");
  });

  test("rate-limits repeated expensive simulation requests", async () => {
    let limited = false;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      const result = await request("/simulations/run", {
        method: "POST",
        body: { workspaceId, marketingBudget: 0, discountPercent: 0 },
      });
      if (result.status === 429) {
        limited = true;
        break;
      }
      assert.equal(result.status, 200);
    }
    assert.equal(limited, true);
  });
});