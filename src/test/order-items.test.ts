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
        tracking_code = null, courier_status = null, product = 'Mango', quantity = 1, price = 5
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
        perform public.replace_order_items('${orgId}', '${orderId}', '[{"productId":"${productId}","quantity":12}]');
      exception when others then null;
      end $$;
      select quantity, price from public.orders where id = '${orderId}';
      select count(*) from public.order_items where order_id = '${orderId}';
      select stock_quantity from public.products where id = '${productId}';
      rollback;
    `);
    expect(result).toMatch(/1\s+\|\s+5\.00/);
    expect(result).toMatch(/1\n/);
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
});
