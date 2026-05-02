-- Fix RLS policies on orders table to scope by org_id
-- Previously USING (true) allowed any authenticated user to read/write all orgs' orders

-- Drop the permissive policies
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;

-- Helper: resolve the calling user's org_id from app_settings
-- (same key pattern used by server/index.js getUserAndOrgId)
CREATE OR REPLACE FUNCTION public.get_caller_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT value::uuid
  FROM public.app_settings
  WHERE key = 'user:' || auth.uid()::text || ':org_id'
  LIMIT 1;
$$;

-- Scoped policies: each user only sees rows belonging to their org
CREATE POLICY "Users can view own org orders"
ON public.orders FOR SELECT TO authenticated
USING (org_id = public.get_caller_org_id());

CREATE POLICY "Users can insert own org orders"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (org_id = public.get_caller_org_id());

CREATE POLICY "Users can update own org orders"
ON public.orders FOR UPDATE TO authenticated
USING (org_id = public.get_caller_org_id());

CREATE POLICY "Users can delete own org orders"
ON public.orders FOR DELETE TO authenticated
USING (org_id = public.get_caller_org_id());

-- Service role retains unrestricted access (used by server/index.js)
DO $$ BEGIN
  CREATE POLICY "service_role_all_orders" ON public.orders
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
