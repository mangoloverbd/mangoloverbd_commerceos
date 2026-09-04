import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const migrationsDir = join(root, "supabase/migrations");
const migrationPaths = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => join(migrationsDir, name));

function commandPath(name) {
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

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
}

function localCompatibleSql(sql) {
  const sharedDirectory = run(pgConfig, ["--sharedir"], { capture: true }).trim();
  if (existsSync(join(sharedDirectory, "extension/vector.control"))) return sql;

  return sql
    .replace(/create extension if not exists vector with schema extensions;\n/i, "")
    .replaceAll("extensions.vector(1536)", "text")
    .replace(
      /create(?: or replace)? function public\.match_products_by_embedding\([\s\S]*?\n\$\$;\n/i,
      "",
    );
}

const bootstrapSql = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);
alter table storage.objects enable row level security;
create publication supabase_realtime;
`;

const assertionSql = `
do $$
declare
  runtime_table_count integer;
  rls_table_count integer;
begin
  select count(*) into runtime_table_count
  from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r';
  if runtime_table_count <> 20 then
    raise exception 'Expected 20 runtime tables, found %', runtime_table_count;
  end if;

  select count(*) into rls_table_count
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relkind = 'r'
    and relrowsecurity;
  if rls_table_count <> runtime_table_count then
    raise exception 'RLS enabled on % of % runtime tables', rls_table_count, runtime_table_count;
  end if;

  if has_table_privilege('anon', 'public.orders', 'select') then
    raise exception 'anon can select orders';
  end if;
  if exists (
    select 1
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and has_any_column_privilege('anon', c.oid, 'select,insert,update,references')
  ) then
    raise exception 'anon has a public runtime-table privilege';
  end if;
  if has_table_privilege('authenticated', 'public.orders', 'select') then
    raise exception 'authenticated browser role can select orders';
  end if;
  if not exists (
    select 1
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname = 'warehouses'
      and c.relkind = 'r'
      and c.relrowsecurity
  ) then
    raise exception 'warehouses is missing or does not have RLS enabled';
  end if;
  if has_table_privilege('anon', 'public.warehouses', 'select,insert,update,delete') then
    raise exception 'anon can access warehouses';
  end if;
  if has_table_privilege('authenticated', 'public.warehouses', 'select,insert,update,delete') then
    raise exception 'authenticated can access warehouses';
  end if;
  if not has_table_privilege('service_role', 'public.warehouses', 'select,insert,update,delete') then
    raise exception 'service_role lacks warehouse table privileges';
  end if;
  if has_function_privilege('anon', 'public.current_user_org_id()', 'execute') then
    raise exception 'anon can execute current_user_org_id';
  end if;
  if exists (
    select 1
    from pg_proc as p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'anon can execute a public function';
  end if;
  if has_function_privilege('authenticated', 'public.current_user_org_id()', 'execute') then
    raise exception 'authenticated can execute current_user_org_id';
  end if;
  if has_function_privilege('anon', 'public.set_default_warehouse(uuid, uuid)', 'execute') then
    raise exception 'anon can execute set_default_warehouse';
  end if;
  if has_function_privilege('authenticated', 'public.set_default_warehouse(uuid, uuid)', 'execute') then
    raise exception 'authenticated can execute set_default_warehouse';
  end if;
  if not has_function_privilege('service_role', 'public.set_default_warehouse(uuid, uuid)', 'execute') then
    raise exception 'service_role cannot execute set_default_warehouse';
  end if;
  if not has_function_privilege('service_role', 'public.create_warehouse(uuid, text, text, text, text, boolean)', 'execute') then
    raise exception 'service_role cannot execute create_warehouse';
  end if;
  if not has_function_privilege('service_role', 'public.update_warehouse(uuid, uuid, text, text, text, text, boolean)', 'execute') then
    raise exception 'service_role cannot execute update_warehouse';
  end if;
  if not has_function_privilege('service_role', 'public.delete_warehouse(uuid, uuid)', 'execute') then
    raise exception 'service_role cannot execute delete_warehouse';
  end if;
  if not has_function_privilege('service_role', 'public.bulk_assign_products_to_warehouse(uuid, uuid[], uuid)', 'execute') then
    raise exception 'service_role cannot execute bulk_assign_products_to_warehouse';
  end if;
  if not has_table_privilege('service_role', 'public.meta_connections', 'select,insert,update,delete') then
    raise exception 'service_role lacks server-table privileges';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'product-images'
      and public
      and file_size_limit = 5242880
  ) then
    raise exception 'product-images bucket configuration is missing';
  end if;
  if exists (
    values
      ('orders', 'source'),
      ('orders', 'payment_method'),
      ('orders', 'courier_fee'),
      ('products', 'selling_price'),
      ('products', 'stock_quantity'),
      ('products', 'image_embedding'),
      ('product_images', 'storage_path'),
      ('product_variants', 'attributes'),
      ('storefront_settings', 'shipping_zones'),
      ('social_conversations', 'order_fields'),
      ('social_inbox_orders', 'courier_name')
    except
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
  ) then
    raise exception 'A runtime-required column is missing';
  end if;
end
$$;
`;

const rlsBehaviorSql = `
begin;
insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
insert into public.user_roles (user_id, org_id, role) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'admin'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'admin');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
do $$
declare
  visible_roles integer;
begin
  select count(*) into visible_roles from public.user_roles;
  if visible_roles <> 1 then
    raise exception 'RLS exposed % user roles instead of the caller row', visible_roles;
  end if;
end
$$;
rollback;
`;

const warehouseBehaviorSql = `
begin;
do $$
declare
  org_a constant uuid := '20000000-0000-0000-0000-000000000001';
  org_b constant uuid := '20000000-0000-0000-0000-000000000002';
  product_a constant uuid := '30000000-0000-0000-0000-000000000001';
  product_b constant uuid := '30000000-0000-0000-0000-000000000002';
  main_warehouse uuid;
  seasonal_warehouse uuid;
  updated_count integer;
begin
  select id into main_warehouse
  from public.create_warehouse(org_a, 'Main', null, null, null, true);
  select id into seasonal_warehouse
  from public.create_warehouse(org_a, 'Seasonal', null, null, null, false);

  perform public.update_warehouse(
    org_a, seasonal_warehouse, 'Seasonal', null, null, null, true
  );
  if (select count(*) from public.warehouses where org_id = org_a and is_default and deleted_at is null) <> 1 then
    raise exception 'Warehouse default mutation did not preserve exactly one default';
  end if;

  begin
    perform public.create_warehouse(org_a, 'Main', null, null, null, true);
    raise exception 'Duplicate warehouse creation unexpectedly succeeded';
  exception when unique_violation then
    null;
  end;
  if not exists (
    select 1 from public.warehouses
    where id = seasonal_warehouse and is_default and deleted_at is null
  ) then
    raise exception 'Failed create did not roll back the default change';
  end if;

  insert into public.products (id, org_id, name) values
    (product_a, org_a, 'Org A product'),
    (product_b, org_b, 'Org B product');

  begin
    perform public.bulk_assign_products_to_warehouse(
      org_a, array[product_a, product_b], main_warehouse
    );
    raise exception 'Cross-workspace bulk assignment unexpectedly succeeded';
  exception when sqlstate 'P0002' then
    null;
  end;
  if (select warehouse_id from public.products where id = product_a) is not null then
    raise exception 'Failed bulk assignment partially updated a product';
  end if;

  updated_count := public.bulk_assign_products_to_warehouse(
    org_a, array[product_a], main_warehouse
  );
  if updated_count <> 1 then
    raise exception 'Expected one assigned product, got %', updated_count;
  end if;

  perform public.delete_warehouse(org_a, main_warehouse);
  if (select warehouse_id from public.products where id = product_a) is not null then
    raise exception 'Warehouse deletion did not clear product assignment';
  end if;
  if not exists (select 1 from public.warehouses where id = main_warehouse and deleted_at is not null) then
    raise exception 'Warehouse deletion did not soft-delete the warehouse';
  end if;

  begin
    perform public.delete_warehouse(org_a, seasonal_warehouse);
    raise exception 'Default warehouse deletion unexpectedly succeeded';
  exception when check_violation then
    null;
  end;
end
$$;
rollback;
`;

function verifyFreshDatabase(runNumber) {
  const workDirectory = mkdtempSync(join(tmpdir(), "mangoloverbd-baseline-"));
  const dataDirectory = join(workDirectory, "data");
  const socketDirectory = join(workDirectory, "socket");
  const migrationCopy = join(workDirectory, "baseline.sql");
  let started = false;

  try {
    run(initdb, ["-D", dataDirectory, "--no-locale", "--encoding=UTF8"], {
      stdio: "pipe",
    });
    run(commandPath("mkdir"), ["-p", socketDirectory], { stdio: "pipe" });
    run(pgCtl, [
      "-D",
      dataDirectory,
      "-l",
      join(workDirectory, "postgres.log"),
      "-o",
      `-k ${socketDirectory} -c listen_addresses=`,
      "start",
    ], { stdio: "pipe" });
    started = true;

    const connection = ["-X", "-v", "ON_ERROR_STOP=1", "-h", socketDirectory, "postgres"];
    run(psql, [...connection, "-c", bootstrapSql], { stdio: "pipe" });
    for (const migrationPath of migrationPaths) {
      writeFileSync(
        migrationCopy,
        localCompatibleSql(readFileSync(migrationPath, "utf8")),
        "utf8",
      );
      run(psql, [...connection, "-f", migrationCopy], { stdio: "pipe" });
    }
    run(psql, [...connection, "-c", assertionSql], { stdio: "pipe" });
    run(psql, [...connection, "-c", rlsBehaviorSql], { stdio: "pipe" });
    run(psql, [...connection, "-c", warehouseBehaviorSql], { stdio: "pipe" });
    process.stdout.write(`Baseline reset ${runNumber}: passed\n`);
  } finally {
    if (started) {
      run(pgCtl, ["-D", dataDirectory, "stop", "-m", "fast"], { stdio: "pipe" });
    }
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

verifyFreshDatabase(1);
verifyFreshDatabase(2);
