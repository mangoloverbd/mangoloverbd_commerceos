-- Staff asked to see the customer's real IP on the order Risk tab. The risk
-- engine previously kept only a salted hash and the /24 (or /64) network
-- block. The raw address is stored alongside them, stays service-role only
-- like the rest of the table, and is cleared by the 30-day retention scrub.
begin;

alter table public.order_risk_attempts
  add column if not exists ip_address inet null;

commit;
