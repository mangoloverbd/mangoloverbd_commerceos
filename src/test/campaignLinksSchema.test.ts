import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { startCampaignPostgres } from "./helpers/campaignPostgres";
import { buildExpiryPatch, buildPersonalDataScrubPatch } from "../../server/abandonedCheckouts.js";

const org = "20000000-0000-4000-8000-000000000001";
const otherOrg = "20000000-0000-4000-8000-000000000002";
let db: ReturnType<typeof startCampaignPostgres>;
beforeAll(() => {
  db = startCampaignPostgres(sql => {
    sql(`insert into public.orders(org_id,order_number,source,price,created_at) values ('${org}','BEFORE-CAMPAIGN','website',1234,'2026-09-01T00:00:00Z');
      insert into public.abandoned_checkouts(org_id,draft_key,source,source_path,customer_name)
      values ('${org}','10000000-0000-4000-8000-000000000001','storefront','/checkout','Original draft');
      insert into public.order_protection_reviews(org_id,source_route,score,expires_at,customer_name)
      values ('${org}','/checkout',0,now()+interval '1 day','Original hold');`);
  });
}, 60_000);
afterAll(() => db?.stop());

function link(workspace = org) {
  const id = randomUUID();
  const slug = `link-${id}`;
  db.sql(`set role service_role; insert into public.campaign_links(id,org_id,slug,name,channel) values ('${id}','${workspace}','${slug}','Test','facebook');`);
  return { id, slug, org: workspace };
}
function clickSql(l: ReturnType<typeof link>, request = randomUUID(), bot = false, slug = l.slug) {
  return `select id from public.record_campaign_link_click('${l.org}','${l.id}','${slug}','${request}',null,null,'unknown',${bot});`;
}
function click(l: ReturnType<typeof link>, request = randomUUID(), bot = false) {
  return db.sql(`set role service_role; ${clickSql(l, request, bot)}`);
}
function draft() {
  const id = randomUUID();
  db.sql(`set role service_role; insert into public.abandoned_checkouts(id,org_id,draft_key,source,source_path) values ('${id}','${org}','${randomUUID()}','storefront','/checkout');`);
  return id;
}
function attribution(id: string, clickId: string, at = "2026-10-02T12:00:00Z") {
  return `select campaign_click_id from public.attribute_campaign_checkout('${org}','${id}','${clickId}','${at}');`;
}
function sqlError(query: string, expected: string) {
  expect(() => db.sql(query)).toThrow(expected);
}

describe("campaign additive schema on disposable PostgreSQL", () => {
  it("creates service-only campaign persistence with RLS", () => {
    expect(db.sql("select to_regclass('public.campaign_links')")).toBe("campaign_links");
    expect(db.sql("select count(*) from pg_class where oid in ('public.campaign_links'::regclass,'public.campaign_link_clicks'::regclass) and relrowsecurity")).toBe("2");
  });

  it("keeps legacy unattributed order, draft and hold inserts working", () => {
    expect(db.sql(`select price || ':' || source || ':' || (campaign_click_id is null)::text from public.orders where org_id='${org}' and order_number='BEFORE-CAMPAIGN'`)).toBe("1234.00:website:true");
    expect(db.sql(`select customer_name from public.abandoned_checkouts where org_id='${org}' and draft_key='10000000-0000-4000-8000-000000000001'`)).toBe("Original draft");
    expect(db.sql(`select count(*) from public.order_protection_reviews where org_id='${org}' and customer_name='Original hold' and campaign_click_id is null`)).toBe("1");
    db.sql(`set role service_role; insert into public.orders(org_id,order_number,source) values ('${org}','LEGACY','website');
      insert into public.order_protection_reviews(org_id,source_route,score,expires_at) values ('${org}','/checkout',0,now()+interval '1 day');`);
    const id = draft();
    expect(db.sql(`select campaign_click_id is null and campaign_link_id is null and campaign_attributed_at is null from public.abandoned_checkouts where id='${id}'`)).toBe("t");
    expect(db.sql("select source from public.orders where order_number='LEGACY'")).toBe("website");
    const l = link(), c = click(l);
    sqlError(`update public.orders set campaign_link_id='${l.id}',campaign_click_id='${c}',campaign_attributed_at=now() where org_id='${org}' and order_number='LEGACY'`, "order campaign attribution is immutable");
  });

  it("enforces metadata limits, slug syntax, channel and HTTP(S) post URLs", () => {
    for (const [column, value] of [
      ["slug", "bad--slug"], ["slug", "ab"], ["slug", "x".repeat(61)], ["name", ""], ["name", "x".repeat(121)],
      ["channel", "email"], ["creator_name", "x".repeat(121)], ["post_url", "javascript:alert(1)"],
      ["post_url", "https://"], ["post_url", "https://example.com/" + "x".repeat(2048)], ["notes", "x".repeat(2001)],
      ["destination_path", "//evil.example"], ["destination_path", "https://evil.example"],
    ]) {
      const l = link();
      sqlError(`set role service_role; update public.campaign_links set ${column}='${value}' where org_id='${org}' and id='${l.id}'`, "check constraint");
    }
    const l = link();
    db.sql(`update public.campaign_links set post_url='https://example.com/post?x=1',creator_name=repeat('x',120),notes=repeat('x',2000) where id='${l.id}';`);
  });

  it("rejects cross-workspace clicks and all incomplete or mismatched attribution triples", () => {
    const a = link(), b = link(), foreign = link(otherOrg);
    const ca = click(a), cf = click(foreign);
    sqlError(`insert into public.campaign_link_clicks(org_id,link_id,request_id) values ('${org}','${foreign.id}','${randomUUID()}')`, "foreign key constraint");
    const tables = [
      ["orders", `org_id,order_number`, `'${org}','${randomUUID()}'`],
      ["abandoned_checkouts", "org_id,draft_key,source,source_path", `'${org}','${randomUUID()}','storefront','/checkout'`],
      ["order_protection_reviews", "org_id,source_route,score,expires_at", `'${org}','/checkout',0,now()+interval '1 day'`],
    ];
    for (const [table, columns, values] of tables) {
      for (const triple of [
        `'${a.id}',null,null`, `null,'${ca}',null`, `null,null,now()`,
        `'${a.id}','${ca}',null`, `'${a.id}',null,now()`, `null,'${ca}',now()`,
      ]) sqlError(`insert into public.${table}(${columns},campaign_link_id,campaign_click_id,campaign_attributed_at) values (${values},${triple})`, "check constraint");
      for (const triple of [`'${b.id}','${ca}',now()`, `'${foreign.id}','${cf}',now()`, `'${a.id}','${randomUUID()}',now()`]) {
        sqlError(`insert into public.${table}(${columns},campaign_link_id,campaign_click_id,campaign_attributed_at) values (${values},${triple})`, "foreign key constraint");
      }
      db.sql(`insert into public.${table}(${columns},campaign_link_id,campaign_click_id,campaign_attributed_at) values (${values},'${a.id}','${ca}',now())`);
    }
  });

  it("denies browser reads, writes and RPC execution and disallows server history deletion", () => {
    for (const role of ["anon", "authenticated"]) {
      for (const table of ["campaign_links", "campaign_link_clicks"]) {
        sqlError(`set role ${role}; select * from public.${table}`, "permission denied");
        sqlError(`set role ${role}; delete from public.${table}`, "permission denied");
        expect(db.sql(`select has_table_privilege('${role}','public.${table}','insert,update,truncate,references,trigger')`)).toBe("f");
      }
      const l = link();
      sqlError(`set role ${role}; ${clickSql(l)}`, "permission denied");
      sqlError(`set role ${role}; select * from public.rename_campaign_link('${org}','${l.id}','new-slug')`, "permission denied");
      sqlError(`set role ${role}; ${attribution(randomUUID(), randomUUID())}`, "permission denied");
    }
    for (const table of ["campaign_links", "campaign_link_clicks"]) {
      sqlError(`set role service_role; delete from public.${table}`, "permission denied");
      sqlError(`set role service_role; truncate public.${table} cascade`, "permission denied");
    }
    sqlError("set role service_role; update public.campaign_link_clicks set is_bot=true", "permission denied");
  });

  it("returns the original click on retries, without rewriting metadata or attaching a different link", () => {
    const a = link(), b = link();
    const request = randomUUID();
    const first = click(a, request);
    expect(click(a, request, true)).toBe(first);
    sqlError(`set role service_role; ${clickSql(b, request)}`, "request belongs to another campaign link");
    expect(db.sql(`select count(*) from public.campaign_link_clicks where org_id='${org}' and request_id='${request}'`)).toBe("1");
    expect(db.sql(`select is_bot from public.campaign_link_clicks where id='${first}'`)).toBe("f");
    expect(click(link(otherOrg), request)).not.toBe(first);
  });

  it("keeps archived links resolvable and records clicks without changing their destination", () => {
    const l = link();
    db.sql(`set role service_role; update public.campaign_links set archived_at=now(),destination_path='/step/honey-nut?variant=large#buy' where org_id='${org}' and id='${l.id}'`);
    expect(click(l)).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.sql(`select destination_path from public.campaign_links where org_id='${org}' and slug='${l.slug}'`)).toBe("/step/honey-nut?variant=large#buy");
  });

  it("allows renaming before clicks but blocks changed slugs after bot clicks, including direct updates", () => {
    const l = link();
    expect(db.sql(`set role service_role; select slug from public.rename_campaign_link('${org}','${l.id}','renamed-link')`)).toBe("renamed-link");
    l.slug = "renamed-link";
    click(l, randomUUID(), true);
    sqlError(`set role service_role; select * from public.rename_campaign_link('${org}','${l.id}','another-name')`, "campaign slug is locked");
    sqlError(`set role service_role; update public.campaign_links set slug='another-name' where id='${l.id}' and org_id='${org}'`, "campaign slug is locked");
    expect(db.sql(`set role service_role; select slug from public.rename_campaign_link('${org}','${l.id}','renamed-link')`)).toBe("renamed-link");
    sqlError(`set role service_role; select * from public.rename_campaign_link('${otherOrg}','${l.id}','another-name')`, "campaign link not found");
  });

  it("actually serializes first click against rename in both transaction orders", async () => {
    const a = link();
    const clickWins = await db.race(clickSql(a), `select * from public.rename_campaign_link('${org}','${a.id}','rename-lost');`);
    expect(clickWins.ok).toBe(false);
    expect(clickWins.output).toContain("campaign slug is locked");
    const b = link();
    const renameWins = await db.race(`select * from public.rename_campaign_link('${org}','${b.id}','rename-won');`, clickSql(b));
    expect(renameWins.ok).toBe(false);
    expect(renameWins.output).toContain("campaign link not found");
    expect(db.sql(`select count(*) from public.campaign_link_clicks where org_id='${org}' and link_id='${b.id}'`)).toBe("0");
    b.slug = "rename-won";
    expect(click(b)).toMatch(/^[0-9a-f-]{36}$/);
  }, 15_000);

  it("serializes duplicate requests on the same and different links", async () => {
    const a = link(), b = link();
    const request = randomUUID();
    const same = await db.race(clickSql(a, request), clickSql(a, request));
    expect(same.ok).toBe(true);
    expect(db.sql(`select count(*) from public.campaign_link_clicks where org_id='${org}' and request_id='${request}'`)).toBe("1");
    const conflict = randomUUID();
    const different = await db.race(clickSql(a, conflict), clickSql(b, conflict));
    expect(different.ok).toBe(false);
    expect(different.output).toContain("request belongs to another campaign link");
  }, 15_000);

  it("keeps the newest valid human draft click and rejects expired, future, bot and foreign inputs", () => {
    const a = link(), b = link(), foreign = link(otherOrg);
    const old = click(a), recent = click(b), bot = click(a, randomUUID(), true), cf = click(foreign);
    db.sql(`update public.campaign_link_clicks set clicked_at='2026-10-01T12:00:00Z' where id='${old}';
      update public.campaign_link_clicks set clicked_at='2026-10-02T12:00:00Z' where id in ('${recent}','${bot}','${cf}');`);
    const id = draft();
    db.sql(`set role service_role; ${attribution(id, recent)}`);
    for (const c of [old, bot, cf, randomUUID()]) db.sql(`set role service_role; ${attribution(id, c)}`);
    db.sql(`set role service_role; select * from public.attribute_campaign_checkout('${org}','${id}',null,now());
      select * from public.attribute_campaign_checkout('${org}','${id}','${recent}',null);
      select * from public.attribute_campaign_checkout('${org}','${id}','${recent}','infinity');`);
    db.sql(`set role service_role; ${attribution(id, recent, "2026-10-02T11:59:59.999Z")}`);
    db.sql(`set role service_role; ${attribution(id, recent, "2026-11-01T12:00:00.001Z")}`);
    expect(db.sql(`select campaign_click_id from public.abandoned_checkouts where id='${id}'`)).toBe(recent);
    const edge = draft();
    expect(db.sql(`set role service_role; ${attribution(edge, recent, "2026-11-01T12:00:00Z")}`)).toBe(recent);
    expect(db.sql(`set role service_role; select count(*) from public.attribute_campaign_checkout('${otherOrg}','${id}','${cf}','2026-10-02T12:00:00Z')`)).toBe("0");
    db.sql(`update public.abandoned_checkouts set status='dismissed' where id='${edge}';`);
    expect(db.sql(`set role service_role; ${attribution(edge, old)}`)).toBe(recent);
  });

  it("serializes reordered draft attribution updates without losing the newer click", async () => {
    const a = link(), b = link();
    const old = click(a), recent = click(b);
    db.sql(`update public.campaign_link_clicks set clicked_at='2026-10-01T12:00:00Z' where id='${old}';
      update public.campaign_link_clicks set clicked_at='2026-10-02T12:00:00Z' where id='${recent}';`);
    for (const [first, second] of [[recent, old], [old, recent]]) {
      const id = draft();
      const result = await db.race(attribution(id, first), attribution(id, second));
      expect(result.ok).toBe(true);
      expect(db.sql(`select campaign_click_id from public.abandoned_checkouts where id='${id}'`)).toBe(recent);
    }
  }, 15_000);

  it("preserves historical attribution through existing draft/review scrubbing and order reconciliation", () => {
    const l = link();
    const c = click(l);
    const id = draft();
    db.sql(`update public.abandoned_checkouts set created_at=now()-interval '40 days',customer_name='Customer',phone='01712345678',campaign_link_id='${l.id}',campaign_click_id='${c}',campaign_attributed_at=now() where id='${id}';`);
    // Expiry is immutable; create a dedicated expired fixture rather than altering it.
    const expired = randomUUID();
    db.sql(`insert into public.abandoned_checkouts(id,org_id,draft_key,source,source_path,created_at,expires_at,campaign_link_id,campaign_click_id,campaign_attributed_at)
      values ('${expired}','${org}','${randomUUID()}','storefront','/checkout',now()-interval '40 days',now()-interval '10 days','${l.id}','${c}',now());`);
    const patch = buildExpiryPatch(new Date());
    // Use actual application patches, encoding values as JSON to retain null/array semantics.
    db.sql(`update public.abandoned_checkouts set (status,resolved_at,resolution) =
      (select status,resolved_at,resolution from jsonb_populate_record(null::public.abandoned_checkouts,'${JSON.stringify(patch)}')) where id='${expired}'`);
    for (const scrub of [patch, buildPersonalDataScrubPatch()]) {
      db.sql(`update public.abandoned_checkouts set (customer_name,phone,address,cart,campaign,subtotal,delivery_rate,total) =
        (select customer_name,phone,address,cart,campaign,subtotal,delivery_rate,total from jsonb_populate_record(null::public.abandoned_checkouts,'${JSON.stringify(scrub)}')) where id='${expired}'`);
    }
    expect(db.sql(`select campaign_click_id || ':' || status || ':' || (phone is null)::text from public.abandoned_checkouts where id='${expired}'`)).toBe(`${c}:expired:true`);
    expect(db.sql(`set role service_role; ${attribution(expired, randomUUID())}`)).toBe(c);
    const review = randomUUID();
    db.sql(`insert into public.order_protection_reviews(id,org_id,source_route,score,expires_at,campaign_link_id,campaign_click_id,campaign_attributed_at,customer_name)
      values ('${review}','${org}','/checkout',0,now()-interval '1 day','${l.id}','${c}',now(),'Customer');
      set role service_role; select public.scrub_expired_order_protection_reviews();`);
    expect(db.sql(`select campaign_click_id || ':' || status from public.order_protection_reviews where id='${review}'`)).toBe(`${c}:expired`);
    const order = randomUUID();
    db.sql(`insert into public.orders(id,org_id,order_number,source,abandoned_draft_key_hash,campaign_link_id,campaign_click_id,campaign_attributed_at)
      select '${order}','${org}','${order}','website',encode(extensions.digest(draft_key::text,'sha256'),'hex'),'${l.id}','${c}',now() from public.abandoned_checkouts where id='${id}';
      set role service_role; select public.reconcile_abandoned_checkouts('${org}');`);
    expect(db.sql(`select abandoned_checkout_id from public.orders where id='${order}'`)).toBe(id);
    sqlError(`update public.orders set campaign_link_id=null,campaign_click_id=null,campaign_attributed_at=null where id='${order}'`, "order campaign attribution is immutable");
    sqlError(`delete from public.campaign_link_clicks where id='${c}'`, "foreign key constraint");
    sqlError(`delete from public.campaign_links where id='${l.id}'`, "foreign key constraint");
  });

  it("has indexed campaign joins and retains the existing draft-ID/hash indexes without duplicates", () => {
    for (const columns of ["org_id, clicked_at, id", "org_id, link_id, clicked_at, id"]) {
      expect(db.sql(`select count(*) from pg_indexes where schemaname='public' and tablename='campaign_link_clicks' and indexdef like '%(${columns})%'`)).toBe("1");
    }
    for (const table of ["orders", "abandoned_checkouts", "order_protection_reviews"]) {
      expect(db.sql(`select count(*) from pg_indexes where schemaname='public' and tablename='${table}' and indexdef like '%(org_id, campaign_link_id, campaign_click_id)%'`)).toBe("1");
    }
    for (const table of ["orders", "abandoned_checkouts"]) {
      expect(db.sql(`select count(*) from pg_indexes where schemaname='public' and tablename='${table}' and indexdef like '%(org_id, campaign_click_id)%'`)).toBe("1");
    }
    expect(db.sql("select count(*) from pg_indexes where schemaname='public' and tablename='orders' and (indexdef like '%(org_id, abandoned_checkout_id)%' or indexdef like '%(org_id, abandoned_draft_key_hash)%')")).toBe("2");
  });
});
