function cacheBaseUrl(publicDomain, path) {
  return `https://${publicDomain}${path}`;
}

export function buildProductCacheUrls({ publicDomain, orgId, handle, productSlug, listChanged, inventoryIds = [] }) {
  const bases = [
    handle ? { path: `/api/public/v1/${handle}`, hasProductInventory: true } : null,
    { path: `/api/public/v1/storefronts/${orgId}`, hasProductInventory: true },
    { path: `/api/public/storefronts/${orgId}`, hasProductInventory: false },
  ].filter(Boolean);
  const encodedSlug = productSlug ? encodeURIComponent(productSlug) : null;

  const encodedInventoryIds = inventoryIds.map((id) => encodeURIComponent(id)).join(",");
  return bases.flatMap(({ path, hasProductInventory }) => [
    ...(listChanged ? [cacheBaseUrl(publicDomain, `${path}/products`)] : []),
    ...(hasProductInventory && encodedInventoryIds
      ? [cacheBaseUrl(publicDomain, `${path}/inventory?ids=${encodedInventoryIds}`)]
      : []),
    ...(encodedSlug ? [
      cacheBaseUrl(publicDomain, `${path}/products/${encodedSlug}`),
      ...(hasProductInventory ? [cacheBaseUrl(publicDomain, `${path}/products/${encodedSlug}/inventory`)] : []),
    ] : []),
  ]);
}

export async function purgeProductCacheUrls({ zoneId, apiToken, urls, warmToken, fetchImpl = fetch }) {
  if (!zoneId || !apiToken || urls.length === 0) {
    return { purged: false };
  }

  const response = await fetchImpl(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ files: urls }),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare purge failed: ${await response.text()}`);
  }

  if (warmToken) {
    await Promise.all(
      urls.map((url) => fetchImpl(url, { headers: { "X-Warm-Token": warmToken } })),
    );
  }

  return { purged: true };
}
