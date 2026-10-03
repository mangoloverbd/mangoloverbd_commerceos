import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
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

// This is the canonical runtime-table contract. Keep the SQL assertion below
// derived from this list so adding a legitimate table requires an explicit,
// reviewable contract change instead of a fragile magic-number update.
const runtimeTables = Object.freeze([
  "user_roles",
  "app_settings",
  "orders",
  "products",
  "product_images",
  "product_variants",
  "storefront_settings",
  "social_conversations",
  "social_messages",
  "social_inbox_orders",
  "meta_connections",
  "meta_pages",
  "meta_instagram_accounts",
  "meta_whatsapp_accounts",
  "meta_ad_accounts",
  "meta_webhook_events",
  "order_chat_history",
  "ai_action_log",
  "warehouses",
  "order_items",
  "abandoned_checkouts",
  "order_protection_events",
  "order_protection_reviews",
  "order_risk_attempts",
  "order_risk_list_entries",
  "order_status_events",
  "fraud_checks",
  "order_activity_events",
  "customer_profiles",
  "customer_notes",
  "campaign_links",
  "campaign_link_clicks",
  "analytics_sessions",
  "analytics_events",
  "analytics_session_pages",
  "analytics_session_products",
  "analytics_order_facts",
]);

const runtimeTablesSql = runtimeTables.map((table) => `'${table}'`).join(", ");

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
  if to_regclass('public.customer_profiles') is null or to_regclass('public.customer_notes') is null then
    raise exception 'Customer profile persistence is missing';
  end if;
  if public.normalize_customer_phone('+880 1712-345678') is distinct from '01712345678'
     or public.normalize_customer_phone('1712345678') is distinct from '01712345678'
     or public.normalize_customer_phone('invalid') is not null
     or public.normalize_customer_phone('88001712345678') is not null then
    raise exception 'Customer phone normalization differs from the application';
  end if;
  if has_table_privilege('authenticated', 'public.customer_profiles', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.customer_notes', 'select,insert,update,delete')
     or has_table_privilege('service_role', 'public.customer_notes', 'update,delete,truncate')
     or has_table_privilege('service_role', 'public.customer_profiles', 'delete,truncate') then
    raise exception 'Customer context or append-only notes expose excess privileges';
  end if;
  if not has_table_privilege('service_role', 'public.customer_notes', 'select')
     or not has_table_privilege('service_role', 'public.customer_notes', 'insert')
     or not has_table_privilege('service_role', 'public.customer_profiles', 'select')
     or not has_table_privilege('service_role', 'public.customer_profiles', 'insert')
     or not has_table_privilege('service_role', 'public.customer_profiles', 'update') then
    raise exception 'Customer profile server privileges are missing';
  end if;
  if has_table_privilege('authenticated', 'public.campaign_links', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.campaign_link_clicks', 'select,insert,update,delete')
     or has_table_privilege('service_role', 'public.campaign_links', 'delete,truncate')
     or has_table_privilege('service_role', 'public.campaign_link_clicks', 'update,delete,truncate') then
    raise exception 'Campaign persistence exposes excess privileges';
  end if;
  if not has_table_privilege('service_role', 'public.campaign_links', 'select')
     or not has_table_privilege('service_role', 'public.campaign_links', 'insert')
     or not has_table_privilege('service_role', 'public.campaign_links', 'update')
     or not has_table_privilege('service_role', 'public.campaign_link_clicks', 'select')
     or not has_table_privilege('service_role', 'public.campaign_link_clicks', 'insert') then
    raise exception 'Campaign server privileges are missing';
  end if;
  if has_table_privilege('anon', 'public.analytics_sessions', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.analytics_sessions', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.analytics_events', 'select,insert,update,delete')
     or has_function_privilege('authenticated', 'public.record_analytics_hit(uuid, uuid, uuid, uuid, text, text, text, integer, timestamptz, jsonb)', 'execute')
     or has_table_privilege('service_role', 'public.analytics_events', 'update,truncate')
     or has_table_privilege('anon', 'public.analytics_order_facts', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.analytics_order_facts', 'select,insert,update,delete')
     or has_function_privilege('authenticated', 'public.record_analytics_order_fact(uuid, uuid, uuid, timestamptz)', 'execute')
     or has_table_privilege('service_role', 'public.analytics_order_facts', 'update,delete,truncate') then
    raise exception 'Website analytics exposes excess privileges';
  end if;
  if not has_table_privilege('service_role', 'public.analytics_sessions', 'select,insert,update')
     or not has_table_privilege('service_role', 'public.analytics_events', 'select,insert')
     or not has_function_privilege('service_role', 'public.record_analytics_hit(uuid, uuid, uuid, uuid, text, text, text, integer, timestamptz, jsonb)', 'execute')
     or not has_table_privilege('service_role', 'public.analytics_order_facts', 'select,insert')
     or not has_function_privilege('service_role', 'public.record_analytics_order_fact(uuid, uuid, uuid, timestamptz)', 'execute') then
    raise exception 'Website analytics server privileges are missing';
  end if;
  select count(*) into runtime_table_count
  from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r';
  if runtime_table_count <> ${runtimeTables.length} then
    raise exception 'Expected ${runtimeTables.length} runtime tables, found %', runtime_table_count;
  end if;
  if exists (
    select expected_table
    from unnest(array[${runtimeTablesSql}]::text[]) as expected_table
    except
    select relname
    from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
  ) then
    raise exception 'A canonical runtime table is missing';
  end if;
  if exists (
    select relname
    from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
    except
    select expected_table
    from unnest(array[${runtimeTablesSql}]::text[]) as expected_table
  ) then
    raise exception 'An unexpected runtime table exists';
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
  if not has_table_privilege('service_role', 'public.order_status_events', 'select,insert') then
    raise exception 'service_role lacks order status event privileges';
  end if;
  if not has_table_privilege('service_role', 'public.order_activity_events', 'select,insert') then
    raise exception 'service_role lacks detailed order activity privileges';
  end if;
  if has_table_privilege('anon', 'public.order_activity_events', 'select,insert,update,delete')
    or has_table_privilege('authenticated', 'public.order_activity_events', 'select,insert,update,delete') then
    raise exception 'browser roles can access detailed order activity';
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
      ('orders', 'abandoned_checkout_id'),
      ('orders', 'abandoned_draft_key_hash'),
      ('orders', 'created_by'),
      ('orders', 'assigned_to'),
      ('orders', 'confirmed_by'),
      ('orders', 'confirmed_at'),
      ('orders', 'cancelled_by'),
      ('orders', 'cancelled_at'),
      ('orders', 'origin_source'),
      ('orders', 'origin_actor_kind'),
      ('orders', 'detailed_activity_started_at'),
      ('orders', 'cancellation_reason_code'),
      ('orders', 'cancellation_reason_note'),
      ('orders', 'risk_attempt_id'),
      ('order_protection_reviews', 'attempt_id'),
      ('order_protection_reviews', 'abandoned_draft_key_hash'),
      ('order_protection_reviews', 'analytics_session_id'),
      ('abandoned_checkouts', 'draft_key'),
      ('abandoned_checkouts', 'expires_at'),
      ('abandoned_checkouts', 'origin_source'),
      ('abandoned_checkouts', 'origin_actor_kind'),
      ('abandoned_checkouts', 'detailed_activity_started_at'),
      ('products', 'selling_price'),
      ('products', 'stock_quantity'),
      ('products', 'image_embedding'),
      ('product_images', 'storage_path'),
      ('product_variants', 'attributes'),
      ('storefront_settings', 'shipping_zones'),
      ('social_conversations', 'order_fields'),
      ('social_inbox_orders', 'courier_name'),
      ('social_inbox_orders', 'created_by'),
      ('social_inbox_orders', 'assigned_to'),
      ('social_inbox_orders', 'confirmed_by'),
      ('social_inbox_orders', 'confirmed_at'),
      ('social_inbox_orders', 'cancelled_by'),
      ('social_inbox_orders', 'cancelled_at'),
      ('social_inbox_orders', 'origin_source'),
      ('social_inbox_orders', 'origin_actor_kind'),
      ('social_inbox_orders', 'detailed_activity_started_at'),
      ('social_inbox_orders', 'cancellation_reason_code'),
      ('social_inbox_orders', 'cancellation_reason_note'),
      ('user_roles', 'display_name'),
      ('user_roles', 'deleted_at'),
      ('order_status_events', 'org_id'),
      ('order_status_events', 'order_id'),
      ('order_status_events', 'order_table'),
      ('order_status_events', 'from_status'),
      ('order_status_events', 'to_status'),
      ('order_status_events', 'actor_id'),
      ('order_status_events', 'actor_kind'),
      ('order_status_events', 'created_at')
      ,('order_activity_events', 'org_id')
      ,('order_activity_events', 'order_id')
      ,('order_activity_events', 'order_table')
      ,('order_activity_events', 'event_type')
      ,('order_activity_events', 'category')
      ,('order_activity_events', 'actor_id')
      ,('order_activity_events', 'actor_kind')
      ,('order_activity_events', 'group_id')
      ,('order_activity_events', 'source_surface')
      ,('order_activity_events', 'summary')
      ,('order_activity_events', 'changes')
      ,('order_activity_events', 'metadata')
      ,('order_activity_events', 'view_bucket')
      ,('order_activity_events', 'created_at')
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

const customerProfileBehaviorSql = `
begin;
insert into public.orders (org_id, order_number, phone) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PROFILE-TEST', '+880 1712-345678');
insert into public.social_inbox_orders (org_id, platform, notes) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'facebook', E'Phone: +880 1712-345678\\nAddress: Dhaka');
do $$ begin
  if (select customer_phone_key from public.orders where order_number = 'PROFILE-TEST') is distinct from '01712345678'
     or (select customer_phone_key from public.social_inbox_orders where org_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is distinct from '01712345678' then
    raise exception 'Generated phone keys differ from application parsing';
  end if;
end $$;
update public.social_inbox_orders set notes = 'Phone:' || chr(160) || chr(10) || '01712345678'
  where org_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$ begin
  if (select customer_phone_key from public.social_inbox_orders where org_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is distinct from '01712345678' then
    raise exception 'Unicode whitespace differs from JavaScript inbox phone parsing';
  end if;
end $$;
update public.social_inbox_orders set notes = 'Phone: invalid, Phone: 01712345678'
  where org_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
do $$ begin
  if (select customer_phone_key from public.social_inbox_orders where org_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') is not null then
    raise exception 'Multiple phone labels must use first-match parsing';
  end if;
end $$;
set local role service_role;
insert into public.customer_notes (id, org_id, customer_key, body, author_id, author_name)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '01712345678', 'Private note', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Staff');
do $$ begin
  begin
    update public.customer_notes set body = 'Changed';
    raise exception 'Append-only note update was allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.customer_notes;
    raise exception 'Append-only note delete was allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
`;

async function verifyCustomerContextConcurrency(connection) {
  const execute = promisify(execFile);
  async function raceWrite(sql) {
    // Keep the winning transaction open, then prove the competitor is waiting
    // on its lock before committing. Merely launching two processes at once
    // could accidentally test only sequential writes.
    const winner = spawn(psql, [...connection, "-qAt"], { stdio: ["pipe", "pipe", "pipe"] });
    let winnerError = "";
    winner.stderr.on("data", (chunk) => { winnerError += String(chunk); });
    const exited = new Promise((resolve) => winner.once("exit", resolve));
    const held = new Promise((resolve, reject) => {
      let output = "";
      winner.stdout.on("data", (chunk) => { output += String(chunk); if (output.includes("PROFILE_LOCK_HELD")) resolve(); });
      winner.once("error", reject);
      winner.once("exit", (code) => { if (code !== 0) reject(new Error(winnerError)); });
    });
    winner.stdin.write(`begin; ${sql}\n\\echo PROFILE_LOCK_HELD\n`);
    await held;
    const competing = execute(psql, [...connection, "-qAt", "-c", sql], { env: { ...process.env, PGAPPNAME: "customer-profile-concurrency-test" } })
      .then((result) => ({ status: "fulfilled", stdout: result.stdout }), (error) => ({ status: "rejected", stderr: String(error.stderr) }));
    try {
      run(psql, [...connection, "-c", `do $$ begin
        for attempt in 1..500 loop
          if exists (select 1 from pg_stat_activity where application_name = 'customer-profile-concurrency-test' and wait_event_type = 'Lock') then return; end if;
          perform pg_sleep(0.01);
        end loop;
        raise exception 'Competing customer context write never waited on the held transaction';
      end $$;`], { stdio: "pipe" });
    } finally {
      winner.stdin.end("commit;\n");
      await exited;
    }
    if (winnerError) throw new Error(winnerError);
    return competing;
  }
  const firstSave = `set role service_role;
    insert into public.customer_profiles (org_id, customer_key, updated_by, updated_by_name)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '01712345678', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Staff') returning version;`;
  const first = await raceWrite(firstSave);
  if (first.status !== "rejected" || !first.stderr.includes("duplicate key")) {
    throw new Error("Concurrent initial context saves did not produce one success and one uniqueness conflict");
  }
  const update = `set role service_role;
    update public.customer_profiles set version = 2, tags = array['VIP']
    where org_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and customer_key = '01712345678' and version = 1 returning version;`;
  const updateResult = await raceWrite(update);
  if (updateResult.status !== "fulfilled" || updateResult.stdout.split(/\s+/).includes("2")) {
    throw new Error("Concurrent context updates did not produce one success and one version conflict");
  }
}

async function verifyFreshDatabase(runNumber) {
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
    run(psql, [...connection, "-c", customerProfileBehaviorSql], { stdio: "pipe" });
    await verifyCustomerContextConcurrency(connection);
    process.stdout.write(`Baseline reset ${runNumber}: passed\n`);
  } finally {
    if (started) {
      run(pgCtl, ["-D", dataDirectory, "stop", "-m", "fast"], { stdio: "pipe" });
    }
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

await verifyFreshDatabase(1);
await verifyFreshDatabase(2);
