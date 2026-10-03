-- Keep a non-personal draft identity through hold approval when capture arrives
-- later. Existing holds remain null; no backfill or startup DDL.
begin;
alter table public.order_protection_reviews
  add column abandoned_draft_key_hash text
    constraint order_protection_reviews_draft_hash_check
    check (abandoned_draft_key_hash ~ '^[0-9a-f]{64}$');
comment on column public.order_protection_reviews.abandoned_draft_key_hash is
  'SHA-256 of the validated checkout draft UUID; retained through PII scrubbing for late-capture linkage.';
commit;
