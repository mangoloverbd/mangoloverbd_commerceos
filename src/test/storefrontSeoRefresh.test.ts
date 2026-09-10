import { describe, expect, it } from "vitest";

import {
  isAuthorizedCronRequest,
  parseStorefrontSeoRefreshJob,
  processStorefrontSeoRefresh,
  queueStorefrontSeoRefresh,
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
  it("persists a queued job before a worker can submit it", async () => {
    let stored: string | null = null;

    const result = await queueStorefrontSeoRefresh({
      readJob: async () => stored,
      compareAndSetJob: async (expected, job) => {
        if (expected !== stored) return false;
        stored = JSON.stringify(job);
        return true;
      },
      now: fixedNow,
      createRequestId: () => "request-1",
    });

    expect(result).toMatchObject({ status: "queued", deploymentId: null, attempts: 0, requestId: "request-1" });
    expect(JSON.parse(stored ?? "null")).toMatchObject({ status: "queued", requestId: "request-1" });
  });

  it("surfaces a durable queue write failure", async () => {
    await expect(queueStorefrontSeoRefresh({
      readJob: async () => null,
      compareAndSetJob: async () => {
        throw new Error("database unavailable");
      },
      now: fixedNow,
      createRequestId: () => "request-1",
    })).rejects.toThrow("database unavailable");

  });

  it("keeps the queued record when saving a submitted deployment fails", async () => {
    const rawJob = JSON.stringify(createQueuedJob());
    const released: string[] = [];

    await expect(processStorefrontSeoRefresh({
      rawJob,
      readJob: async () => rawJob,
      claim: async () => true,
      release: async (requestId) => { released.push(requestId); },
      compareAndSetJob: async () => { throw new Error("tracking save failed"); },
      clearJob: async () => true,
      getDeployment: async () => ({ readyState: "QUEUED" }),
      submitDeployment: async () => ({ id: "dpl_123" }),
      now: fixedNow,
    })).rejects.toThrow("tracking save failed");

    expect(released).toEqual(["request-1"]);
  });

  it("keeps the tracked record when clearing a ready deployment fails", async () => {
    const rawJob = JSON.stringify(createQueuedJob({ status: "tracking", deploymentId: "dpl_123", attempts: 1 }));
    const released: string[] = [];

    await expect(processStorefrontSeoRefresh({
      rawJob,
      readJob: async () => rawJob,
      claim: async () => true,
      release: async (requestId) => { released.push(requestId); },
      compareAndSetJob: async () => true,
      clearJob: async () => { throw new Error("clear save failed"); },
      getDeployment: async () => ({ readyState: "READY" }),
      submitDeployment: async () => ({ id: "must-not-submit" }),
      now: fixedNow,
    })).rejects.toThrow("clear save failed");

    expect(released).toEqual(["request-1"]);
  });

  it("keeps a bounded queued job when deployment submission fails", async () => {
    const result = await reconcileStorefrontSeoRefresh({
      job: createQueuedJob(),
      getDeployment: async () => ({ readyState: "QUEUED" }),
      submitDeployment: async () => {
        throw new Error(`Bearer secret ${"x".repeat(600)}`);
      },
      now: fixedNow,
    });

    expect(result).toMatchObject({ action: "submit", job: { status: "queued", deploymentId: null, attempts: 1 } });
    const job = result.job;
    expect(job).toBeDefined();
    if (!job) throw new Error("expected queued job");
    const lastError = job.lastError ?? "";
    expect(lastError).not.toContain("secret");
    expect(lastError).not.toContain("x".repeat(100));
    expect(lastError.length).toBeLessThanOrEqual(500);
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

  it("replaces a missing Vercel deployment immediately", async () => {
    const missing = Object.assign(new Error("Storefront deployment status failed (404)"), { status: 404 });
    const result = await reconcileStorefrontSeoRefresh({
      job: createQueuedJob({ status: "tracking", deploymentId: "dpl_missing", attempts: 1, lastAttemptAt: fixedNow.toISOString() }),
      getDeployment: async () => { throw missing; },
      submitDeployment: async () => ({ id: "dpl_replacement" }),
      now: fixedNow,
    });

    expect(result).toMatchObject({
      action: "submit",
      job: { status: "tracking", deploymentId: "dpl_replacement", attempts: 2 },
    });
  });

  it("preserves a newer queued request when an older worker completes", async () => {
    const original = JSON.stringify(createQueuedJob({ status: "tracking", deploymentId: "dpl_old", attempts: 1 }));
    const newer = JSON.stringify(createQueuedJob({ requestId: "request-2" }));
    let stored = original;
    const released: string[] = [];

    const result = await processStorefrontSeoRefresh({
      rawJob: original,
      readJob: async () => stored,
      claim: async () => true,
      release: async (requestId) => { released.push(requestId); },
      compareAndSetJob: async (expected, job) => {
        if (stored !== expected) return false;
        stored = JSON.stringify(job);
        return true;
      },
      clearJob: async (expected) => {
        if (stored !== expected) return false;
        stored = "null";
        return true;
      },
      getDeployment: async () => {
        stored = newer;
        return { readyState: "READY" };
      },
      submitDeployment: async () => ({ id: "must-not-submit" }),
      now: fixedNow,
    });

    expect(result.action).toBe("superseded");
    expect(stored).toBe(newer);
    expect(released).toEqual(["request-1"]);
  });

  it("does not let a second worker submit while the lease is held", async () => {
    const rawJob = JSON.stringify(createQueuedJob());
    const result = await processStorefrontSeoRefresh({
      rawJob,
      readJob: async () => rawJob,
      claim: async () => false,
      release: async () => {},
      compareAndSetJob: async () => true,
      clearJob: async () => true,
      getDeployment: async () => { throw new Error("must not read deployment"); },
      submitDeployment: async () => { throw new Error("must not submit"); },
      now: fixedNow,
    });

    expect(result.action).toBe("busy");
  });

  it("replaces malformed stored data with a fresh queued job", async () => {
    expect(parseStorefrontSeoRefreshJob("not json")).toBeNull();

    let stored = "not json";
    const result = await queueStorefrontSeoRefresh({
      readJob: async () => stored,
      compareAndSetJob: async (expected, job) => {
        if (expected !== stored) return false;
        stored = JSON.stringify(job);
        return true;
      },
      now: fixedNow,
      createRequestId: () => "fresh-request",
    });

    expect(result).toMatchObject({ requestId: "fresh-request", status: "queued", deploymentId: null });
  });

  it("replaces an older tracked request when a later product edit needs a fresh deployment", async () => {
    let stored = JSON.stringify(createQueuedJob({ status: "tracking", deploymentId: "dpl_old", attempts: 3 }));
    const result = await queueStorefrontSeoRefresh({
      readJob: async () => stored,
      compareAndSetJob: async (expected, job) => {
        if (expected !== stored) return false;
        stored = JSON.stringify(job);
        return true;
      },
      now: fixedNow,
      createRequestId: () => "latest-request",
    });

    expect(result).toMatchObject({ requestId: "latest-request", status: "queued", deploymentId: null, attempts: 0 });
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
