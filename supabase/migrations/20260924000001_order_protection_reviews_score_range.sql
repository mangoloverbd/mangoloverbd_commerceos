-- The v2 risk engine sums signal points, so held reviews legitimately score
-- above 100 (e.g. 150-190 on repeat-prank patterns). The legacy 0-100 cap
-- rejects those review rows, which silently turned holds into orders.
-- Widen the range; the lower bound stays.
begin;

alter table public.order_protection_reviews drop constraint if exists order_protection_reviews_score_check;
alter table public.order_protection_reviews
  add constraint order_protection_reviews_score_check check (score >= 0);

commit;
