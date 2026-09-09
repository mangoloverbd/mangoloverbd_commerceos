import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");

function handlerFor(anchor: string, nextAnchor: string): string {
  const start = source.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(nextAnchor, start + anchor.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("storefront SEO refresh wiring", () => {
  it("uses the durable refresh module with bounded server-only Vercel calls", () => {
    expect(source).toContain('from "./storefrontSeoRefresh.js"');
    expect(source).toContain("requestStorefrontSeoRefresh");
    expect(source).toContain("retryPendingStorefrontSeoRefreshes");
    expect(source).toContain("queueStorefrontSeoRefresh");
    expect(source).toContain("processStorefrontSeoRefresh");
    expect(source).toContain("STOREFRONT_SEO_REFRESH_TIMEOUT_MS = 10_000");
    expect(source).toContain("AbortSignal.timeout(STOREFRONT_SEO_REFRESH_TIMEOUT_MS)");
    expect(source).toContain("SEO_BUILD_PRODUCT_FIELDS");
  });

  it("persists and advances refresh jobs with compare-and-set writes", () => {
    const refresh = handlerFor("async function readStorefrontSeoRefreshJob", "async function getStorefrontSeoDeploymentConfig");

    expect(refresh).toContain("compareAndSetStorefrontSeoRefreshJob");
    expect(refresh).toContain('.eq("value", expectedValue)');
    expect(refresh).toContain("claimStorefrontSeoRefreshLease");
    expect(refresh).toContain("releaseStorefrontSeoRefreshLease");
    const request = handlerFor("async function requestStorefrontSeoRefresh", "async function retryPendingStorefrontSeoRefreshes");
    expect(request).toContain("void processPendingStorefrontSeoRefresh");
  });

  it("keeps a missing Vercel deployment distinguishable from transient status errors", () => {
    const deploymentStatus = handlerFor("async function getStorefrontSeoDeployment(deploymentId)", "async function processPendingStorefrontSeoRefresh");

    expect(deploymentStatus).toContain("error.status = response.status");
  });

  it("queues a refresh only after successful SEO-relevant product writes", () => {
    expect(handlerFor('app.post("/api/products/save"', 'app.post("/api/products/crawl"')).toContain(
      "requestStorefrontSeoRefresh",
    );
    const patchProduct = handlerFor('app.patch("/api/products/:id"', 'app.delete("/api/products/:id"');
    expect(patchProduct).toContain("SEO_BUILD_PRODUCT_FIELDS");
    expect(patchProduct).toContain("requestStorefrontSeoRefresh");
    expect(handlerFor('app.delete("/api/products/:id"', 'app.post("/api/products/publish-all"')).toContain(
      "requestStorefrontSeoRefresh",
    );
    expect(handlerFor('app.post("/api/products/publish-all"', 'app.post("/api/products/:id/images"')).toContain(
      "requestStorefrontSeoRefresh",
    );
    expect(handlerFor('app.post("/api/products/:id/images"', 'app.patch("/api/products/:id/images/reorder"')).toContain(
      "requestStorefrontSeoRefresh",
    );
    expect(handlerFor('app.patch("/api/products/:id/images/reorder"', 'app.delete("/api/products/:id/images/:imageId"')).toContain(
      "requestStorefrontSeoRefresh",
    );
    expect(handlerFor('app.delete("/api/products/:id/images/:imageId"', 'app.post("/api/products/regenerate-embeddings"')).toContain(
      "requestStorefrontSeoRefresh",
    );
  });

  it("does not deploy static SEO files for stock-only or variant writes", () => {
    const patchProduct = handlerFor('app.patch("/api/products/:id"', 'app.delete("/api/products/:id"');
    expect(patchProduct).toContain("SEO_BUILD_PRODUCT_FIELDS.has(field)");
    expect(handlerFor('app.post("/api/products/:id/variants"', 'app.patch("/api/products/:id/variants/:variantId"')).not.toContain(
      "requestStorefrontSeoRefresh",
    );
    expect(handlerFor('app.patch("/api/products/:id/variants/:variantId"', 'app.delete("/api/products/:id/variants/:variantId"')).not.toContain(
      "requestStorefrontSeoRefresh",
    );
    expect(handlerFor('app.delete("/api/products/:id/variants/:variantId"', 'async function ensureAppSettingsTable')).not.toContain(
      "requestStorefrontSeoRefresh",
    );
  });

  it("passes SEO refresh scheduling into Order Chat product mutations", () => {
    const apply = handlerFor('app.post("/api/order-chat/apply"', 'app.post("/api/order-chat/answer"');

    expect(apply).toContain("requestStorefrontSeoRefresh");
  });

  it("protects the retry route with the Vercel cron secret before reading settings", () => {
    const cron = handlerFor('app.get("/api/internal/storefront-seo-refresh"', 'function dnsRecordFor');
    const authorizationCheck = cron.indexOf("isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)");
    const retry = cron.indexOf("retryPendingStorefrontSeoRefreshes");

    expect(authorizationCheck).toBeGreaterThan(-1);
    expect(retry).toBeGreaterThan(authorizationCheck);
    expect(cron).toContain('return res.status(401).json({ error: "Unauthorized" });');
    expect(cron).not.toContain("req.query.orgId");
    expect(cron).not.toContain("req.params.orgId");
  });

  it("configures one daily production cron and documents blank server-only variables", () => {
    expect(vercelConfig.crons).toEqual([
      { path: "/api/internal/storefront-seo-refresh", schedule: "0 3 * * *" },
  ]);
  expect(envExample).toContain("STOREFRONT_GIT_REPO=mangoloverbd/mangoloverbd_storefront");
  expect(envExample).toContain("VERCEL_PROJECT_ID=");
    expect(envExample).toContain("CRON_SECRET=");
  });
});
