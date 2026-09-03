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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    insert into public.product_variants (id, org_id, product_id, attributes) values
      ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '{"size":"large"}');
  `);
  applyFile(migrationPath);
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
    expect(result).toMatch(/\n\s*3\s+\|\s+3\s+\|\s+1\s*\n/);
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
