import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { buildProductCacheUrls, purgeProductCacheUrls } from "../../server/productCache.js";

const root = resolve(process.cwd());
const baselinePath = join(
  root,
  "supabase/migrations/20260828000000_canonical_schema_reconciliation.sql",
);
const migrationPath = join(
  root,
  "supabase/migrations/20260902224522_add_order_items.sql",
);
const rpcMigrationPath = join(
  root,
  "supabase/migrations/20260903000100_add_order_item_edit_rpc.sql",
);
const discountMigrationPath = join(
  root,
  "supabase/migrations/20260904000100_add_order_item_discounts.sql",
);

function commandPath(name: string): string {
  const configuredBin = process.env.PG_BINDIR;
  if (configuredBin) return join(configuredBin, name);

  for (const directory of (process.env.PATH || "").split(delimiter)) {
    const candidate = join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`${name} was not found. Install PostgreSQL or set PG_BINDIR.`);
}

const initdb = commandPath("initdb");
const pgCtl = commandPath("pg_ctl");
const psql = commandPath("psql");
const pgConfig = commandPath("pg_config");

let workDirectory: string;
let socketDirectory: string;
let connection: string[];
const contractOnly = process.env.ORDER_ITEMS_CONTRACT_ONLY === "1";

function runSql(sql: string): string {
  return execFileSync(psql, [...connection, "-c", sql], {
    encoding: "utf8",
    stdio: "pipe",
  });
}

function localCompatibleSql(sql: string): string {
  const sharedDirectory = execFileSync(pgConfig, ["--sharedir"], {
    encoding: "utf8",
  }).trim();
  if (existsSync(join(sharedDirectory, "extension/vector.control"))) return sql;

  return sql
    .replace(/create extension if not exists vector with schema extensions;\n/i, "")
    .replaceAll("extensions.vector(1536)", "text")
    .replace(
      /create(?: or replace)? function public\.match_products_by_embedding\([\s\S]*?\n\$\$;\n/i,
      "",
    );
}

function applyFile(path: string): void {
  const copy = join(workDirectory, `${path.split("/").pop()}.sql`);
  writeFileSync(copy, localCompatibleSql(readFileSync(path, "utf8")), "utf8");
  execFileSync(psql, [...connection, "-f", copy], { stdio: "pipe" });
}

beforeAll(() => {
  if (contractOnly) return;
  workDirectory = mkdtempSync(join(tmpdir(), "mangoloverbd-order-items-"));
  const dataDirectory = join(workDirectory, "data");
  socketDirectory = join(workDirectory, "socket");
  execFileSync(initdb, ["-D", dataDirectory, "--no-locale", "--encoding=UTF8"], {
    stdio: "pipe",
  });
  execFileSync(commandPath("mkdir"), ["-p", socketDirectory], { stdio: "pipe" });
  execFileSync(
    pgCtl,
    [
      "-D",
      dataDirectory,
      "-l",
      join(workDirectory, "postgres.log"),
      "-o",
      `-k ${socketDirectory} -c listen_addresses=`,
      "start",
    ],
    { stdio: "pipe" },
  );
  connection = ["-X", "-v", "ON_ERROR_STOP=1", "-h", socketDirectory, "postgres"];
  runSql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema extensions;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
  `);
  applyFile(baselinePath);
  runSql(`
    insert into public.orders (id, org_id, order_number, product, price) values
      ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '1001', '2x Mango + 3x Unknown', 10.01),
      ('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '1002', 'Odd legacy text', 10.01),
      ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', '2001', 'Other org item', 1.00);
    insert into public.products (id, org_id, name, selling_price) values
      ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Mango', 5.00);
    insert into public.orders (id, org_id, order_number, product, quantity, price) values
      ('30000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', '1003', 'Mango', 1, 5.00);
    insert into public.product_variants (id, org_id, product_id, attributes) values
      ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '{"size":"large"}');
  `);
  applyFile(migrationPath);
  applyFile(rpcMigrationPath);
  applyFile(discountMigrationPath);
  runSql(`
    update public.products
    set stock_quantity = 10
    where id = '50000000-0000-0000-0000-000000000001';
    update public.product_variants
    set stock_quantity = 4, price_adjustment = 1
    where id = '60000000-0000-0000-0000-000000000001';
  `);
});

afterAll(() => {
  if (contractOnly) return;
  const dataDirectory = join(workDirectory, "data");
  execFileSync(pgCtl, ["-D", dataDirectory, "stop", "-m", "fast"], {
    stdio: "pipe",
  });
  rmSync(workDirectory, { recursive: true, force: true });
});

describe("order item schema", () => {
  it("exposes the complete order_items row shape", () => {
    type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
    const item: OrderItem = {
      id: "item-id",
      org_id: "org-id",
      order_id: "order-id",
      product_id: null,
      variant_id: null,
      product_name: "Legacy product text",
      variant_name: null,
      unit_price: 100,
      discount_type: null,
      discount_value: 0,
      unit_discount: 0,
      quantity: 1,
      created_at: "2026-09-03T00:00:00Z",
      updated_at: "2026-09-03T00:00:00Z",
    };
    expect(item.quantity).toBeGreaterThan(0);
    expect(item.unit_price).toBeGreaterThanOrEqual(0);
  });

  it("backfills valid quantities and non-negative prices", () => {
    const result = runSql(`
      select count(*) as invalid
      from public.order_items
      where quantity <= 0 or unit_price < 0;
    `);
    expect(result).toMatch(/\n\s*0\s*\n/);
  });

  it("rejects negative discount values", () => {
    expect(() =>
      runSql(`
        insert into public.order_items (
          org_id, order_id, product_name, unit_price, quantity,
          discount_type, discount_value, unit_discount
        ) values (
          '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          'Negative entered discount', 5, 1, 'fixed', -1, 0
        );
      `),
    ).toThrow();

    expect(() =>
      runSql(`
        insert into public.order_items (
          org_id, order_id, product_name, unit_price, quantity,
          discount_type, discount_value, unit_discount
        ) values (
          '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          'Negative calculated discount', 5, 1, 'fixed', 1, -1
        );
      `),
    ).toThrow();
  });

  it("rejects unsupported discount types", () => {
    expect(() =>
      runSql(`
        insert into public.order_items (
          org_id, order_id, product_name, unit_price, quantity,
          discount_type, discount_value, unit_discount
        ) values (
          '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          'Unsupported discount', 5, 1, 'coupon', 1, 1
        );
      `),
    ).toThrow();
  });

  it("rejects percentage discounts above one hundred", () => {
    expect(() =>
      runSql(`
        insert into public.order_items (
          org_id, order_id, product_name, unit_price, quantity,
          discount_type, discount_value, unit_discount
        ) values (
          '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          'Oversized percentage', 5, 1, 'percentage', 100.01, 5
        );
      `),
    ).toThrow();
  });

  it("rejects calculated discounts above the authoritative unit price", () => {
    expect(() =>
      runSql(`
        insert into public.order_items (
          org_id, order_id, product_name, unit_price, quantity,
          discount_type, discount_value, unit_discount
        ) values (
          '40000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001',
          'Over-price discount', 5, 1, 'fixed', 5.01, 5.01
        );
      `),
    ).toThrow();
  });

  it("preserves every order and unmatched legacy text", () => {
    const result = runSql(`
      select
        (select count(*) from public.orders) as orders,
        (select count(distinct order_id) from public.order_items) as item_orders,
        (select count(*) from public.order_items where product_name = 'Odd legacy text' and product_id is null) as legacy_items;
    `);
    expect(result).toMatch(/\n\s*4\s+\|\s+4\s+\|\s+1\s*\n/);
  });

  it("preserves each order total exactly for arbitrary quantities", () => {
    const result = runSql(`
      select count(*) as mismatches
      from (
        select o.id
        from public.orders as o
        join public.order_items as i on i.order_id = o.id and i.org_id = o.org_id
        group by o.id, o.price
        having sum(i.unit_price * i.quantity) <> o.price
      ) as mismatches;
    `);
    expect(result).toMatch(/\n\s*0\s*\n/);
  });

  it("rejects item references from another workspace", () => {
    expect(() =>
      runSql(`
        insert into public.order_items (org_id, order_id, product_name, unit_price, quantity)
        values ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'bad', 1, 1);
      `),
    ).toThrow();
  });

  it("prevents parent workspace changes from drifting existing items", () => {
    expect(() =>
      runSql(`
        update public.orders
        set org_id = '40000000-0000-0000-0000-000000000002'
        where id = '30000000-0000-0000-0000-000000000001';
      `),
    ).toThrow();
  });

  it("clears catalog references without nulling item workspace on catalog deletion", () => {
    runSql(`
      insert into public.order_items (org_id, order_id, product_id, product_name, unit_price, quantity)
      values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Deletion product', 5, 1);
      insert into public.order_items (org_id, order_id, variant_id, product_name, unit_price, quantity)
      values ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Deletion variant', 5, 1);
      delete from public.products
      where id = '50000000-0000-0000-0000-000000000001';
    `);

    const result = runSql(`
      select count(*) as preserved
      from public.order_items
      where org_id = '40000000-0000-0000-0000-000000000001'
        and product_id is null
        and variant_id is null
        and product_name like 'Deletion %';
    `);
    expect(result).toMatch(/\n\s*2\s*\n/);
  });
});

describe("order item API contract", () => {
  const source = readFileSync(join(root, "server/index.js"), "utf8");

  it("does not lock orders from courier status alone", () => {
    const start = source.indexOf("function isOrderDispatched");
    const route = source.slice(start, source.indexOf("\n}", start));
    expect(route).toContain("order.sent_to_courier === true");
    expect(route).not.toMatch(/order\.courier_status\s*[,)]/);
  });

  it("defines an authenticated org-scoped order detail endpoint", () => {
    const start = source.indexOf('app.get("/api/orders/:id"');
    expect(start).toBeGreaterThan(-1);
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("getToken(req)");
    expect(route).toContain("getUser(");
    expect(route).toContain('.eq("id", req.params.id)');
    expect(route).toContain('.eq("org_id", orgId)');
    expect(route).toContain("canEditItems");
    expect(route).toContain("items");
  });

  it("keeps legacy orders visible when they have no normalized item rows", () => {
    const start = source.indexOf('app.get("/api/orders/:id"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("order.product");
    expect(route).toContain("order.quantity");
    expect(route).toContain("order.price");
  });

  it("uses the shared catalog resolver for synthesized legacy order items", () => {
    const start = source.indexOf('app.get("/api/orders/:id"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("resolveOrderRouting(supabase, orgId");
    expect(route).toContain("resolvedItems");
    expect(route).toContain("catalogMatchComplete");
    expect(route).toContain("product_id");
    expect(route).toContain("variant_id");
  });

  it("returns explicit zero discount fields for synthesized legacy rows", () => {
    const start = source.indexOf('app.get("/api/orders/:id"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("discount_type: null");
    expect(route).toContain("discount_value: 0");
    expect(route).toContain("unit_discount: 0");
  });

  it("keeps undisbursed legacy orders editable", () => {
    const start = source.indexOf('app.get("/api/orders/:id"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("canEditItems: !isOrderDispatched(order)");
    expect(route).not.toContain("canEditItems: !isOrderDispatched(order) && storedItems.length > 0");
  });

  it("defines an authenticated org-scoped item replacement endpoint", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    expect(start).toBeGreaterThan(-1);
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("getToken(req)");
    expect(route).toContain("getUser(");
    expect(route).toContain('.eq("org_id", orgId)');
    expect(route).toContain("req.body?.items");
    expect(route).toContain('rpc("replace_order_items"');
  });

  it("persists line items when creating a manual order", () => {
    const start = source.indexOf('app.post("/api/orders"');
    expect(start).toBeGreaterThan(-1);
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain('from("order_items")');
    expect(route).toContain("product_name");
    expect(route).toContain("unit_price");
    expect(route).toContain("quantity");
  });

  it("replaces line items through one transactional RPC", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("replace_order_items");
    expect(route).not.toMatch(/\.from\("order_items"\)\s*\.delete/);
    expect(route).not.toMatch(/\.from\("product_variants"\)\s*\.update/);
    expect(route).not.toMatch(/\.from\("products"\)\s*\.update/);
  });

  it("rejects malformed, non-positive, and duplicate item requests", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toMatch(/Array\.isArray\(requestedItems\)/);
    expect(route).toMatch(/quantity.*integer|Number\.isInteger/);
    expect(route).toMatch(/quantity.*1|quantity < 1/);
    expect(route).toMatch(/duplicate|Duplicate/i);
  });

  it("does not trust a client-supplied order total", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("replace_order_items");
    expect(route).not.toMatch(/req\.body\??\.price|req\.body\??\.total/);
    expect(route).toContain("order");
    expect(route).toContain("items");
  });

  it("validates catalog ownership before replacing items", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain('from("products")');
    expect(route).toContain('from("product_variants")');
    expect(route).toContain('.eq("org_id", orgId)');
  });

  it("rejects malformed catalog UUIDs and checks variant/product pairing", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toMatch(/UUID|uuid/i);
    expect(route).toMatch(/variant.*product|product.*variant/i);
    expect(route).toContain("product_id");
  });

  it("normalizes only supported finite non-negative discount intent", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toMatch(/discountType.*null.*fixed.*percentage/s);
    expect(route).toMatch(/Number\.isFinite\(discountValue\)/);
    expect(route).toMatch(/discountValue\s*<\s*0/);
    expect(route).toMatch(/discountType\s*===\s*["']percentage["'].*discountValue\s*>\s*100/s);
  });

  it("normalizes the value to zero when no discount mode is selected", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toMatch(/discountType\s*===\s*null\s*\?\s*0\s*:\s*\(item\.discountValue\s*\?\?\s*0\)/);
  });

  it("passes only identity quantity and discount intent to the transaction", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain(
      "normalizedItems.push({ productId, variantId, quantity, discountType, discountValue });",
    );
    expect(route).not.toMatch(/normalizedItems\.push\([^)]*(?:unitPrice|unitDiscount|price|total)/s);
  });

  it("rejects client-supplied prices calculated discounts and totals", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toMatch(/unitPrice.*unitDiscount.*price.*total/s);
    expect(route).toContain("Client-supplied monetary fields are not allowed");
  });

  it("returns request errors for database-validated discount constraints", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toMatch(/\/discount\/i\.test\(message\)[\s\S]*?res\.status\(400\)/);
  });

  it("batch-loads org-scoped catalog metadata for order item display", () => {
    const start = source.indexOf("async function enrichOrderItems");
    const enrichment = source.slice(start, source.indexOf("const ORDER_ITEM_UUID_RE", start));
    expect(enrichment).toContain('from("products")');
    expect(enrichment).toContain('from("product_variants")');
    expect(enrichment).toContain('from("product_images")');
    expect(enrichment.match(/\.eq\("org_id", orgId\)/g)).toHaveLength(3);
    expect(enrichment).toContain("product_slug");
    expect(enrichment).toContain("image_url");
    expect(enrichment).toContain("weight_kg");
    expect(enrichment).toContain("available_stock");
  });

  it("prefers variant availability and includes the order's reserved quantity", () => {
    const start = source.indexOf("async function enrichOrderItems");
    const enrichment = source.slice(start, source.indexOf("const ORDER_ITEM_UUID_RE", start));
    expect(enrichment).toMatch(/variant\?\.weight_kg\s*\?\?\s*product\?\.weight_kg/);
    expect(enrichment).toMatch(/variant\?\.stock_quantity\s*\?\?\s*product\?\.stock_quantity/);
    expect(enrichment).toMatch(/availableStock\s*\+\s*\(inventoryReserved\s*\?\s*\(Number\(item\.quantity\)\s*\|\|\s*0\)\s*:\s*0\)/);
  });

  it("does not add an unreserved historical quantity to current catalog stock", () => {
    const start = source.indexOf("async function enrichOrderItems");
    const enrichment = source.slice(start, source.indexOf("const ORDER_ITEM_UUID_RE", start));
    expect(enrichment).toContain("inventory_reserved");
    expect(enrichment).toMatch(/inventoryReserved\s*\?\s*\(Number\(item\.quantity\)\s*\|\|\s*0\)\s*:\s*0/);
  });

  it("returns enriched items after a successful item replacement", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("enrichOrderItems(supabase, orgId, items || [])");
    expect(route).toContain("items: enrichedItems");
  });

  it("requires detached legacy rows to be removed or replaced before cart saves", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(route).toContain("Remove or replace detached legacy items before saving cart changes");
  });

  it("purges removed and added product caches plus bulk inventory after success", async () => {
    const productIds = ["old-product", "new-product", "parent-product"];
    const urls = [
      ...productIds.flatMap((productSlug) => buildProductCacheUrls({
        publicDomain: "merchant.example",
        orgId: "org-1",
        handle: "mango-lover",
        productSlug,
        listChanged: false,
      })),
      ...buildProductCacheUrls({
        publicDomain: "merchant.example",
        orgId: "org-1",
        handle: "mango-lover",
        inventoryIds: productIds,
        listChanged: false,
      }),
    ];
    const requests: Array<[string, RequestInit | undefined]> = [];
    await purgeProductCacheUrls({
      zoneId: "zone",
      apiToken: "token",
      urls,
      warmToken: "",
      fetchImpl: async (url, options) => {
        requests.push([String(url), options]);
        return new Response("ok", { status: 200 });
      },
    });

    expect(urls).toContain("https://merchant.example/api/public/v1/mango-lover/products/old-product");
    expect(urls).toContain("https://merchant.example/api/public/v1/mango-lover/products/new-product");
    expect(urls).toContain("https://merchant.example/api/public/v1/mango-lover/products/parent-product");
    expect(urls).toContain("https://merchant.example/api/public/v1/mango-lover/inventory?ids=old-product,new-product,parent-product");
    expect(JSON.parse(String(requests[0][1]?.body)).files).toEqual(urls);
    expect(requests).toHaveLength(1);
  });

  it("does not warm or continue purging when the cache purge fails", async () => {
    const requests: string[] = [];
    await expect(purgeProductCacheUrls({
      zoneId: "zone",
      apiToken: "token",
      urls: ["https://merchant.example/product"],
      warmToken: "warm",
      fetchImpl: async (url) => {
        requests.push(String(url));
        return new Response("failed", { status: 500 });
      },
    })).rejects.toThrow("Cloudflare purge failed");
    expect(requests).toEqual(["https://api.cloudflare.com/client/v4/zones/zone/purge_cache"]);
  });

  it("returns conflict errors for dispatched orders and insufficient stock", () => {
    const start = source.indexOf('app.patch("/api/orders/:id/items"');
    const route = source.slice(start, source.indexOf("\n});", start));
    expect(source).toMatch(/sent_to_courier|courier_status|consignment_id/);
    expect(route).toContain("409");
    expect(route).toMatch(/insufficient stock|stock/i);
  });

  it("keeps wrong-workspace orders invisible", () => {
    const start = source.indexOf('app.get("/api/orders/:id"');
    const end = source.indexOf('app.patch("/api/orders/:id/items"');
    const detail = source.slice(start, end);
    expect(detail).toContain('.eq("id", req.params.id)');
    expect(detail).toContain('.eq("org_id", orgId)');
    expect(detail).toContain("404");
  });
});

describe("order item replacement service", () => {
  const orderId = "30000000-0000-0000-0000-000000000004";
  const orgId = "40000000-0000-0000-0000-000000000001";
  const productId = "50000000-0000-0000-0000-000000000001";
  const variantId = "60000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    runSql(`
      insert into public.products (id, org_id, name, selling_price, stock_quantity)
      values ('${productId}', '${orgId}', 'Mango', 5.00, 10)
      on conflict (id) do update set org_id = excluded.org_id, name = excluded.name,
        selling_price = excluded.selling_price, stock_quantity = excluded.stock_quantity;
      insert into public.product_variants (id, org_id, product_id, attributes, stock_quantity, price_adjustment)
      values ('${variantId}', '${orgId}', '${productId}', '{"size":"large"}', 4, 1)
      on conflict (id) do update set org_id = excluded.org_id, product_id = excluded.product_id,
        stock_quantity = excluded.stock_quantity, price_adjustment = excluded.price_adjustment;
      delete from public.order_items where order_id = '${orderId}';
      insert into public.order_items (org_id, order_id, product_id, product_name, unit_price, quantity)
      values ('${orgId}', '${orderId}', '${productId}', 'Mango', 5, 1);
      update public.orders set sent_to_courier = false, consignment_id = null,
        tracking_code = null, courier_status = null, product = 'Mango', quantity = 1,
        price = 5, discount = 0
      where id = '${orderId}';
    `);
  });

  it("supports add, increase, decrease, and remove with inventory deltas", () => {
    const result = runSql(`
      begin;
      select public.replace_order_items('${orgId}', '${orderId}', '[{"productId":"${productId}","quantity":2},{"variantId":"${variantId}","quantity":1}]');
      select quantity, price, product from public.orders where id = '${orderId}';
      select stock_quantity from public.products where id = '${productId}';
      select stock_quantity from public.product_variants where id = '${variantId}';
      select public.replace_order_items('${orgId}', '${orderId}', '[{"variantId":"${variantId}","quantity":2}]');
      select quantity, price from public.orders where id = '${orderId}';
      select stock_quantity from public.products where id = '${productId}';
      select stock_quantity from public.product_variants where id = '${variantId}';
      select public.replace_order_items('${orgId}', '${orderId}', '[]');
      select quantity, price from public.orders where id = '${orderId}';
      select stock_quantity from public.products where id = '${productId}';
      select stock_quantity from public.product_variants where id = '${variantId}';
      rollback;
    `);
    expect(result).toMatch(/3\s+\|\s+16\.00/);
    expect(result).toMatch(/2\s+\|\s+12\.00/);
    expect(result).toMatch(/0\s+\|\s+0/);
    expect(result).toMatch(/9\n/);
    expect(result).toMatch(/3\n/);
    expect(result).toMatch(/11\n/);
    expect(result).toMatch(/4\n/);
  });

  it("recalculates totals from catalog prices and ignores client totals", () => {
    const result = runSql(`
      begin;
      select public.replace_order_items('${orgId}', '${orderId}', '[{"productId":"${productId}","quantity":2}]');
      select quantity, price from public.orders where id = '${orderId}';
      rollback;
    `);
    expect(result).toMatch(/2\s+\|\s+10\.00/);
  });

  it("calculates fixed and percentage discounts from authoritative catalog prices", () => {
    const result = runSql(`
      begin;
      select public.replace_order_items(
        '${orgId}',
        '${orderId}',
        '[{"productId":"${productId}","quantity":2,"discountType":"fixed","discountValue":1.25},{"variantId":"${variantId}","quantity":1,"discountType":"percentage","discountValue":25}]'
      );
      select product_id, variant_id, unit_price, discount_type, discount_value,
        unit_discount, quantity
      from public.order_items
      where order_id = '${orderId}'
      order by variant_id nulls first;
      select quantity, price, discount
      from public.orders
      where id = '${orderId}';
      rollback;
    `);

    expect(result).toMatch(
      /50000000-0000-0000-0000-000000000001\s+\|\s+\s+\|\s+5\.00\s+\|\s+fixed\s+\|\s+1\.25\s+\|\s+1\.25\s+\|\s+2/,
    );
    expect(result).toMatch(
      /50000000-0000-0000-0000-000000000001\s+\|\s+60000000-0000-0000-0000-000000000001\s+\|\s+6\.00\s+\|\s+percentage\s+\|\s+25\.00\s+\|\s+1\.50\s+\|\s+1/,
    );
    expect(result).toMatch(/3\s+\|\s+12\.00\s+\|\s+4\.00/);
  });

  it("preserves the legacy order discount remainder when replacing discounted items", () => {
    const result = runSql(`
      begin;
      update public.order_items
      set discount_type = 'fixed', discount_value = 1, unit_discount = 1
      where order_id = '${orderId}';
      update public.orders
      set discount = 3, price = 2
      where id = '${orderId}';

      select public.replace_order_items(
        '${orgId}',
        '${orderId}',
        '[{"productId":"${productId}","quantity":2,"discountType":"fixed","discountValue":0.5}]'
      );
      select price, discount
      from public.orders
      where id = '${orderId}';
      rollback;
    `);

    expect(result).toMatch(/7\.00\s+\|\s+3\.00/);
  });

  it("loads detail data only for the authenticated workspace", () => {
    const result = runSql(`
      select count(*)
      from public.orders as o
      join public.order_items as i on i.order_id = o.id and i.org_id = o.org_id
      where o.id = '${orderId}' and o.org_id = '${orgId}';
      select count(*)
      from public.orders as o
      join public.order_items as i on i.order_id = o.id and i.org_id = o.org_id
      where o.id = '${orderId}' and o.org_id = '40000000-0000-0000-0000-000000000002';
    `);
    expect(result).toMatch(/\n\s*1\s*\n/);
    expect(result).toMatch(/\n\s*0\s*\n/);
  });

  it("rejects malformed UUIDs and duplicate item keys in the service", () => {
    expect(() => runSql(`select public.replace_order_items('${orgId}', '${orderId}', '[{"productId":"not-a-uuid","quantity":1}]');`)).toThrow();
    expect(() => runSql(`select public.replace_order_items('${orgId}', '${orderId}', '[{"productId":"${productId}","quantity":1},{"productId":"${productId}","quantity":2}]');`)).toThrow();
  });

  it("rolls back inventory and items when stock is insufficient", () => {
    const result = runSql(`
      begin;
      do $$ begin
        perform public.replace_order_items('${orgId}', '${orderId}', '[{"productId":"${productId}","quantity":12,"discountType":"fixed","discountValue":1}]');
      exception when others then null;
      end $$;
      select quantity, price, discount from public.orders where id = '${orderId}';
      select count(*), max(unit_discount) from public.order_items where order_id = '${orderId}';
      select stock_quantity from public.products where id = '${productId}';
      rollback;
    `);
    expect(result).toMatch(/1\s+\|\s+5\.00\s+\|\s+0\.00/);
    expect(result).toMatch(/1\s+\|\s+0\.00/);
    expect(result).toMatch(/10\n/);
  });

  it("rolls back inventory, items, and order totals when a discount is invalid", () => {
    const result = runSql(`
      begin;
      do $$ begin
        perform public.replace_order_items(
          '${orgId}',
          '${orderId}',
          '[{"productId":"${productId}","quantity":2,"discountType":"fixed","discountValue":5.01}]'
        );
      exception when others then null;
      end $$;
      select quantity, price, discount from public.orders where id = '${orderId}';
      select count(*), max(unit_discount) from public.order_items where order_id = '${orderId}';
      select stock_quantity from public.products where id = '${productId}';
      rollback;
    `);

    expect(result).toMatch(/1\s+\|\s+5\.00\s+\|\s+0\.00/);
    expect(result).toMatch(/1\s+\|\s+0\.00/);
    expect(result).toMatch(/10\n/);
  });

  it("rejects wrong-org orders and mismatched product variants", () => {
    expect(() => runSql(`select public.replace_order_items('40000000-0000-0000-0000-000000000002', '${orderId}', '[]');`)).toThrow();
    expect(() => runSql(`select public.replace_order_items('${orgId}', '${orderId}', '[{"productId":"30000000-0000-0000-0000-000000000003","variantId":"${variantId}","quantity":1}]');`)).toThrow();
  });

  it("locks dispatched orders inside the transaction", () => {
    const result = runSql(`
      begin;
      update public.orders set sent_to_courier = true where id = '${orderId}';
      do $$ begin
        perform public.replace_order_items('${orgId}', '${orderId}', '[{"productId":"${productId}","quantity":2}]');
      exception when others then null;
      end $$;
      select quantity, price, stock_quantity
      from public.orders join public.products on products.id = '${productId}'
      where orders.id = '${orderId}';
      rollback;
    `);
    expect(result).toMatch(/1\s+\|\s+5\.00\s+\|\s+10/);
  });

  it("does not treat courier status alone as proof of dispatch", () => {
    const result = runSql(`
      begin;
      update public.orders
      set sent_to_courier = false,
          consignment_id = null,
          tracking_code = null,
          courier_status = 'pending'
      where id = '${orderId}';
      select public.replace_order_items(
        '${orgId}',
        '${orderId}',
        '[{"productId":"${productId}","quantity":2}]'
      );
      select quantity, price
      from public.orders
      where id = '${orderId}';
      rollback;
    `);

    expect(result).toMatch(/2\s+\|\s+10\.00/);
  });
});
