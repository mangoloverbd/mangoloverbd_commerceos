export type Metrics = {
  intake_count: number;
  order_value: number;
  approved_count: number;
  approved_value: number;
  cancelled_count: number;
  cancelled_value: number;
  returned_count: number;
  returned_value: number;
  pending_count: number;
  pending_value: number;
  delivery_charged: number;
  courier_fees_recorded: number;
  net_delivery_position: number;
  courier_fee_order_count: number;
  order_kg: number;
  approved_kg: number;
  cancelled_kg: number;
  returned_kg: number;
  pending_kg: number;
  weight_order_count: number;
};

export type SeriesBucket = {
  key: string;
  label: string;
  intake_count: number;
  order_value: number;
  website_value: number;
  order_kg: number;
  approved_count: number;
  cancelled_count: number;
  cancelled_value: number;
};

export type LandingPage = {
  path: string | null;
  label: string;
  intake_count: number;
  order_value: number;
  approved_count: number;
  cancelled_count: number;
  returned_count: number;
  pending_count: number;
  order_kg: number;
};

export type ProductWeight = {
  product_id: string | null;
  product_name: string;
  packs: number;
  kg: number;
  approved_packs: number;
  approved_kg: number;
  cancelled_packs: number;
  cancelled_kg: number;
  returned_packs: number;
  returned_kg: number;
  pending_packs: number;
  pending_kg: number;
  order_count: number;
};

export type BusinessReportSource = Metrics & {
  source: string;
  label: string;
  products: ProductWeight[];
  landing_pages: LandingPage[];
};

export type BusinessReportResponse = {
  range: { from: string | null; to: string | null };
  summary: Metrics;
  previous: { range: { from: string; to: string }; summary: Metrics } | null;
  series: { granularity: "hour" | "day"; label: string; buckets: SeriesBucket[] };
  hourly_profile: SeriesBucket[];
  sources: BusinessReportSource[];
  products: ProductWeight[];
  missing_weight_products: Array<{ id: string; name: string }>;
};
