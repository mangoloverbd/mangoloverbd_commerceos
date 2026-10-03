import type { CampaignMetrics, CampaignReport } from '@/lib/campaignLinks';
export function campaignMetrics(financial = false): CampaignMetrics {
  return {
    clicks: 100, estimated_visitor_days: 80, captured_checkouts: 12, orders: 10,
    converted_clicks: 8, pending: 2, confirmed: 1, delivered: 5, cancelled: 1, returned: 1,
    order_value: 10000, delivered_revenue: 5000, click_to_order: 0.08,
    order_to_delivered: 0.5, loss_rate: 0.2, revenue_complete: true,
    revenue_incomplete_reasons: [], order_value_incomplete_reasons: [],
    ...(financial ? { delivered_cogs: 2000, courier_fees: 500, estimated_delivered_profit: 2500,
      cogs_coverage: { set: 5, total: 5, complete_orders: 5, total_orders: 5 },
      courier_fee_coverage: { recorded_orders: 5, total_orders: 10 },
      cogs_incomplete_reasons: [], profit_incomplete_reasons: [] } : {}),
  };
}
export function campaignReportFixture(financial = false): CampaignReport {
  const metrics = campaignMetrics(financial);
  return {
    rows: [{ ...metrics, id: 'link-1', name: 'Himsagar reel', slug: 'himsagar-reel', channel: 'facebook',
      destination_path: '/product/himsagar', creator_name: 'Another staff member', post_url: null,
      notes: 'A shared workspace campaign', created_by: 'other-user', created_at: '2026-10-01T06:00:00Z',
      archived_at: null, has_more: false, recent_orders: [{ id: 'order-1', order_number: '1024',
        created_at: '2026-10-03T06:00:00Z', outcome: 'delivered', delivery_kind: 'partial',
        order_value: 1000, delivered_revenue: null, amount_incomplete_reason: 'partial_delivery_amount_unknown' }] }],
    totals: metrics,
    unattributed: { ...metrics, label: 'Unattributed website orders placed in this period', date_basis: 'order_created' },
    daily: [{ ...metrics, day: '2026-10-03' }],
    meta: { range: { from: '2026-10-03', to: '2026-10-03' }, date_basis: 'click',
      as_of: '2026-10-03T06:00:00.000Z', attribution_window_days: 30, provisional: true,
      order_series_label: 'Orders from these clicks', ...(financial ? { profit_basis: 'Current catalog costs and recorded courier fees.' } : {}) },
  };
}
export function campaignJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
