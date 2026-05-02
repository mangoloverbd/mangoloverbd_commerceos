-- Add org_id for multi-tenant isolation.
-- Each table is wrapped in its own DO block so a missing table never aborts
-- the whole migration batch.

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Notify PostgREST to reload its schema cache so the new columns are
-- recognised immediately without a restart.
NOTIFY pgrst, 'reload schema';
