import { describe, expect, it } from "vitest";
import { describeReviewItems } from "../../server/orderProtectionStore.js";

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  return {
    calls,
    from(table: string) {
      const call = { table, filters: [] as Array<[string, string, unknown]> };
      calls.push(call);
      const query = {
        select: () => query,
        in: (column: string, values: unknown[]) => { call.filters.push(["in", column, values]); return query; },
        eq: (column: string, value: unknown) => { call.filters.push(["eq", column, value]); return query; },
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
          const rows = (tables[table] || []).filter((row) => call.filters.every(([op, column, value]) =>
            op === "in" ? (value as unknown[]).includes(row[column]) : row[column] === value));
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

const catalog = {
  product_variants: [
    { id: "v1", product_id: "p1", org_id: "org", attributes: { size: "1 kg" }, price_adjustment: 100 },
    { id: "v2", product_id: "p2", org_id: "org", attributes: {}, price_adjustment: 0 },
    { id: "v-other", product_id: "p-other", org_id: "other-org", attributes: {}, price_adjustment: 0 },
  ],
  products: [
    { id: "p1", org_id: "org", name: "Sundarbans Honey", selling_price: 650 },
    { id: "p2", org_id: "org", name: "Kalojira Mixed", selling_price: 480 },
    { id: "p-other", org_id: "other-org", name: "Not ours", selling_price: 1 },
  ],
};

describe("describeReviewItems", () => {
  it("adds product name, variant name and unit price to id-only review items", async () => {
    const supabase = fakeSupabase(catalog);
    const [review] = await describeReviewItems({ supabase, orgId: "org", reviews: [{ id: "r1", items: [
      { productId: "p1", variantId: "v1", quantity: 2 },
      { productId: "p2", variantId: "v2", quantity: 1 },
    ] }] });
    expect(review.items).toEqual([
      { productId: "p1", variantId: "v1", quantity: 2, productName: "Sundarbans Honey", variantName: "1 kg", unitPrice: 750 },
      { productId: "p2", variantId: "v2", quantity: 1, productName: "Kalojira Mixed", variantName: null, unitPrice: 480 },
    ]);
  });

  it("keeps items that already carry a name and never reads another workspace's catalog", async () => {
    const supabase = fakeSupabase(catalog);
    const named = { productName: "Typed name", quantity: 1, unitPrice: 10 };
    const [review] = await describeReviewItems({ supabase, orgId: "org", reviews: [{ id: "r1", items: [
      named, { productId: "p-other", variantId: "v-other", quantity: 1 },
    ] }] });
    expect(review.items[0]).toEqual(named);
    expect(review.items[1]).toEqual({ productId: "p-other", variantId: "v-other", quantity: 1 });
    for (const call of supabase.calls) expect(call.filters).toContainEqual(["eq", "org_id", "org"]);
  });

  it("skips the catalog lookup when nothing needs describing", async () => {
    const supabase = fakeSupabase(catalog);
    const reviews = [{ id: "r1", items: [{ productName: "Honey", quantity: 1 }] }, { id: "r2", items: null }];
    expect(await describeReviewItems({ supabase, orgId: "org", reviews })).toEqual(reviews);
    expect(supabase.calls).toHaveLength(0);
  });
});
