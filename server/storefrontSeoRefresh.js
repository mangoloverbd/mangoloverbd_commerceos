import { timingSafeEqual } from "node:crypto";

export const STOREFRONT_SEO_REFRESH_SETTING = "storefront_seo_refresh";

const MAX_ERROR_LENGTH = 500;
const STALE_DEPLOYMENT_MS = 24 * 60 * 60 * 1000;
const IN_PROGRESS_STATES = new Set(["QUEUED", "INITIALIZING", "BUILDING"]);

function isoNow(now) {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function isIsoDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeErrorMessage(error) {
  const message = error instanceof Error && error.message
    ? error.message
    : "Deployment request failed";
  const redacted = message
    .replace(/\b(?:authorization:\s*)?bearer\b[^\r\n]*/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/gi, "[URL redacted]")
    .trim();

  return (redacted || "Deployment request failed").slice(0, MAX_ERROR_LENGTH);
}

function getDeploymentId(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === "object" && typeof value.id === "string" && value.id.trim()) {
    return value.id.trim();
  }

  return null;
}

function createQueuedJob(now, createRequestId) {
  return {
    version: 1,
    requestId: createRequestId(),
    status: "queued",
    deploymentId: null,
    attempts: 0,
    requestedAt: isoNow(now),
    lastAttemptAt: null,
    lastError: null,
  };
}

async function submitRefreshJob(job, submitDeployment, now) {
  const attempted = {
    ...job,
    status: "queued",
    deploymentId: null,
    attempts: job.attempts + 1,
    lastAttemptAt: isoNow(now),
  };

  try {
    const deploymentId = getDeploymentId(await submitDeployment());
    if (!deploymentId) {
      throw new Error("Deployment request did not return an id");
    }

    return {
      action: "submit",
      job: {
        ...attempted,
        status: "tracking",
        deploymentId,
        lastError: null,
      },
    };
  } catch (error) {
    return {
      action: "submit",
      job: {
        ...attempted,
        lastError: safeErrorMessage(error),
      },
    };
  }
}

function isStale(job, now) {
  const attemptedAt = Date.parse(job.lastAttemptAt || job.requestedAt);
  return !Number.isFinite(attemptedAt) || Date.parse(isoNow(now)) - attemptedAt >= STALE_DEPLOYMENT_MS;
}

export function parseStorefrontSeoRefreshJob(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const job = parsed;
  if (job.version !== 1
    || typeof job.requestId !== "string" || !job.requestId.trim()
    || (job.status !== "queued" && job.status !== "tracking")
    || !Number.isSafeInteger(job.attempts) || job.attempts < 0
    || !isIsoDate(job.requestedAt)
    || (job.lastAttemptAt !== null && !isIsoDate(job.lastAttemptAt))
    || (job.lastError !== null && typeof job.lastError !== "string")) {
    return null;
  }

  if (job.status === "tracking" && (typeof job.deploymentId !== "string" || !job.deploymentId.trim())) {
    return null;
  }

  if (job.status === "queued" && job.deploymentId !== null) {
    return null;
  }

  return {
    version: 1,
    requestId: job.requestId,
    status: job.status,
    deploymentId: job.deploymentId,
    attempts: job.attempts,
    requestedAt: job.requestedAt,
    lastAttemptAt: job.lastAttemptAt,
    lastError: job.lastError === null ? null : safeErrorMessage(new Error(job.lastError)),
  };
}

export async function queueStorefrontSeoRefresh({
  readJob,
  compareAndSetJob,
  now,
  createRequestId,
}) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const existingJob = await readJob();
    const queued = createQueuedJob(now, createRequestId);

    // A later product edit intentionally replaces any older request. The
    // conditional write means an older worker can never overwrite it after an
    // external deployment request completes.
    if (await compareAndSetJob(existingJob, queued)) {
      return queued;
    }
  }

  throw new Error("Could not queue storefront SEO refresh");
}

export async function processStorefrontSeoRefresh({
  rawJob,
  readJob,
  claim,
  release,
  compareAndSetJob,
  clearJob,
  getDeployment,
  submitDeployment,
  now,
}) {
  const job = parseStorefrontSeoRefreshJob(rawJob);
  if (!job) {
    return { action: "invalid" };
  }

  if (!await claim(job.requestId)) {
    return { action: "busy", job };
  }

  try {
    // A new mutation may have arrived while this worker was waiting for its
    // lease. Do not submit a deployment for an obsolete request.
    if (await readJob() !== rawJob) {
      return { action: "superseded", job };
    }

    const result = await reconcileStorefrontSeoRefresh({
      job,
      getDeployment,
      submitDeployment,
      now,
    });

    if (result.action === "clear") {
      return await clearJob(rawJob)
        ? { action: "clear", job }
        : { action: "superseded", job };
    }

    if (!result.job) {
      return { action: "invalid" };
    }

    return await compareAndSetJob(rawJob, result.job)
      ? { action: result.action, job: result.job }
      : { action: "superseded", job };
  } finally {
    await release(job.requestId);
  }
}

export async function reconcileStorefrontSeoRefresh({
  job,
  getDeployment,
  submitDeployment,
  now,
}) {
  const parsed = parseStorefrontSeoRefreshJob(job);
  if (!parsed) {
    return { action: "persist" };
  }

  if (parsed.status === "queued" || !parsed.deploymentId) {
    return submitRefreshJob(parsed, submitDeployment, now);
  }

  let readyState = "";
  try {
    const deployment = await getDeployment(parsed.deploymentId);
    readyState = typeof deployment?.readyState === "string" ? deployment.readyState.toUpperCase() : "";
  } catch (error) {
    if (error && typeof error === "object" && error.status === 404) {
      return submitRefreshJob(parsed, submitDeployment, now);
    }

    return {
      action: "persist",
      job: { ...parsed, lastError: safeErrorMessage(error) },
    };
  }

  if (readyState === "READY") {
    return { action: "clear" };
  }

  if (IN_PROGRESS_STATES.has(readyState) && !isStale(parsed, now)) {
    return { action: "persist", job: parsed };
  }

  return submitRefreshJob(parsed, submitDeployment, now);
}

export function isAuthorizedCronRequest(authorization, cronSecret) {
  if (typeof authorization !== "string" || typeof cronSecret !== "string" || !cronSecret) {
    return false;
  }

  const actual = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
