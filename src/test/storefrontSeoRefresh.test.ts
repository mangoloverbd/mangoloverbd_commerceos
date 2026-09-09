import { describe, expect, it } from "vitest";

import {
  enqueueStorefrontSeoRefresh,
  isAuthorizedCronRequest,
  parseStorefrontSeoRefreshJob,
  reconcileStorefrontSeoRefresh,
} from "../../server/storefrontSeoRefresh.js";

const fixedNow = new Date("2026-09-09T03:00:00.000Z");

function createQueuedJob(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    requestId: "request-1",
    status: "queued",
    deploymentId: null,
    attempts: 0,
    requestedAt: fixedNow.toISOString(),
    lastAttemptAt: null,
    lastError: null,
    ...overrides,
  };
}

describe("storefront SEO refresh jobs", () => {
  it("persists a queued job before tracking an accepted deployment", async () => {
    const saved: unknown[] = [];

    const result = await enqueueStorefrontSeoRefresh({
      existingJob: null,
      saveJob: async (job) => { saved.push(job); },
      submitDeployment: async () => ({ id: "dpl_123" }),
      now: fixedNow,
      createRequestId: () => "request-1",
    });

    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ status: "queued", deploymentId: null, attempts: 0 });
    expect(result).toMatchObject({
      status: "tracking",
      deploymentId: "dpl_123",
      attempts: 1,
      requestId: "request-1",
    });
  });

  it("keeps a bounded queued job when deployment submission fails", async () => {
    const saved: unknown[] = [];

    const result = await enqueueStorefrontSeoRefresh({
      existingJob: null,
      saveJob: async (job) => { saved.push(job); },
      submitDeployment: async () => {
        throw new Error(`Bearer secret ${"x".repeat(600)}`);
      },
      now: fixedNow,
      createRequestId: () => "request-1",
    });

    expect(result).toMatchObject({ status: "queued", deploymentId: null, attempts: 1 });
    expect(result.lastError).not.toContain("secret");
    expect(result.lastError).not.toContain("x".repeat(100));
    expect(result.lastError.length).toBeLessThanOrEqual(500);
    expect(saved.at(-1)).toEqual(result);
  });

  it("clears a tracked job only after Vercel reports READY", async () => {
    const result = await reconcileStorefrontSeoRefresh({
      job: createQueuedJob({ status: "tracking", deploymentId: "dpl_123", attempts: 1, lastAttemptAt: fixedNow.toISOString() }),
      getDeployment: async () => ({ readyState: "READY" }),
      submitDeployment: async () => {
        throw new Error("must not submit");
      },
      now: fixedNow,
    });

    expect(result).toEqual({ action: "clear" });
  });

  it.each(["ERROR", "CANCELED"])("retries a terminal %s deployment", async (readyState) => {
    const result = await reconcileStorefrontSeoRefresh({
      job: createQueuedJob({ status: "tracking", deploymentId: "dpl_old", attempts: 1, lastAttemptAt: fixedNow.toISOString() }),
      getDeployment: async () => ({ readyState }),
      submitDeployment: async () => ({ id: "dpl_new" }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      action: "submit",
      job: { status: "tracking", deploymentId: "dpl_new", attempts: 2 },
    });
  });

  it.each(["QUEUED", "INITIALIZING", "BUILDING"])("keeps a recent %s deployment under observation", async (readyState) => {
    const job = createQueuedJob({ status: "tracking", deploymentId: "dpl_123", attempts: 1, lastAttemptAt: fixedNow.toISOString() });
    const result = await reconcileStorefrontSeoRefresh({
      job,
      getDeployment: async () => ({ readyState }),
      submitDeployment: async () => {
        throw new Error("must not submit");
      },
      now: fixedNow,
    });

    expect(result).toEqual({ action: "persist", job });
  });

  it("retries a deployment still in progress after 24 hours", async () => {
    const result = await reconcileStorefrontSeoRefresh({
      job: createQueuedJob({
        status: "tracking",
        deploymentId: "dpl_stale",
        attempts: 1,
        lastAttemptAt: "2026-09-08T02:59:59.000Z",
      }),
      getDeployment: async () => ({ readyState: "BUILDING" }),
      submitDeployment: async () => ({ id: "dpl_fresh" }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      action: "submit",
      job: { status: "tracking", deploymentId: "dpl_fresh", attempts: 2 },
    });
  });

  it("replaces malformed stored data with a fresh queued job", async () => {
    expect(parseStorefrontSeoRefreshJob("not json")).toBeNull();

    const result = await enqueueStorefrontSeoRefresh({
      existingJob: "not json",
      saveJob: async () => {},
      submitDeployment: async () => {
        throw new Error("offline");
      },
      now: fixedNow,
      createRequestId: () => "fresh-request",
    });

    expect(result).toMatchObject({ requestId: "fresh-request", status: "queued", deploymentId: null });
  });

  it("replaces an older tracked request when a later product edit needs a fresh deployment", async () => {
    const result = await enqueueStorefrontSeoRefresh({
      existingJob: createQueuedJob({ status: "tracking", deploymentId: "dpl_old", attempts: 3 }),
      saveJob: async () => {},
      submitDeployment: async () => ({ id: "dpl_latest" }),
      now: fixedNow,
      createRequestId: () => "latest-request",
    });

    expect(result).toMatchObject({ requestId: "latest-request", deploymentId: "dpl_latest", attempts: 1 });
  });
});

describe("storefront SEO refresh cron authorization", () => {
  it("accepts only an exact configured bearer secret", () => {
    expect(isAuthorizedCronRequest("Bearer correct-secret", "correct-secret")).toBe(true);
    expect(isAuthorizedCronRequest(undefined, "correct-secret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer short", "correct-secret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer wrong-secret", "correct-secret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer correct-secret", "")).toBe(false);
  });
});
