-- Harden Row Level Security for the multi-tenant app model.
-- The Express backend uses the service role client and enforces org_id itself,
-- but these policies keep direct Supabase access scoped as defense in depth.

-- Ensure tenant columns exist before policies reference them.
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS org_id UUID;

-- Resolve the caller's organization from user_roles.
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.org_id
  FROM public.user_roles ur
  WHERE ur.user_id::text = auth.uid()::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role::text
  FROM public.user_roles ur
  WHERE ur.user_id::text = auth.uid()::text
  LIMIT 1;
$$;

-- Replace single-tenant uniqueness with tenant-scoped uniqueness where known
-- default constraint names are used by earlier migrations.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_shopify_order_id_key;
ALTER TABLE public.social_conversations DROP CONSTRAINT IF EXISTS social_conversations_platform_contact_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_org_shopify_order_id_unique
ON public.orders(org_id, shopify_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_conversations_org_platform_contact_unique
ON public.social_conversations(org_id, platform, contact_id);

-- user_roles -----------------------------------------------------------------
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own org roles" ON public.user_roles;

CREATE POLICY "Users can view own org roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id::text = auth.uid()::text
  OR org_id = public.current_user_org_id()
);

-- app_settings ---------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can insert app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can update app settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can update app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can delete own org app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can read own org app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can insert own org app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can update own org app_settings" ON public.app_settings;

CREATE POLICY "Admins can read own org app_settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (
  public.current_user_role() = 'admin'
  AND split_part(key, ':', 1) = public.current_user_org_id()::text
);

CREATE POLICY "Admins can insert own org app_settings"
ON public.app_settings
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_role() = 'admin'
  AND split_part(key, ':', 1) = public.current_user_org_id()::text
);

CREATE POLICY "Admins can update own org app_settings"
ON public.app_settings
FOR UPDATE
TO authenticated
USING (
  public.current_user_role() = 'admin'
  AND split_part(key, ':', 1) = public.current_user_org_id()::text
)
WITH CHECK (
  public.current_user_role() = 'admin'
  AND split_part(key, ':', 1) = public.current_user_org_id()::text
);

CREATE POLICY "Admins can delete own org app_settings"
ON public.app_settings
FOR DELETE
TO authenticated
USING (
  public.current_user_role() = 'admin'
  AND split_part(key, ':', 1) = public.current_user_org_id()::text
);

-- orders ---------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own org orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert own org orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update own org orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete own org orders" ON public.orders;

CREATE POLICY "Users can view own org orders"
ON public.orders FOR SELECT TO authenticated
USING (org_id = public.current_user_org_id());

CREATE POLICY "Users can insert own org orders"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Users can update own org orders"
ON public.orders FOR UPDATE TO authenticated
USING (org_id = public.current_user_org_id())
WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Users can delete own org orders"
ON public.orders FOR DELETE TO authenticated
USING (org_id = public.current_user_org_id());

-- products -------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage products" ON public.products;
DROP POLICY IF EXISTS "auth_users_products" ON public.products;
DROP POLICY IF EXISTS "Users can view own org products" ON public.products;
DROP POLICY IF EXISTS "Users can insert own org products" ON public.products;
DROP POLICY IF EXISTS "Users can update own org products" ON public.products;
DROP POLICY IF EXISTS "Users can delete own org products" ON public.products;

CREATE POLICY "Users can view own org products"
ON public.products FOR SELECT TO authenticated
USING (org_id = public.current_user_org_id());

CREATE POLICY "Users can insert own org products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Users can update own org products"
ON public.products FOR UPDATE TO authenticated
USING (org_id = public.current_user_org_id())
WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Users can delete own org products"
ON public.products FOR DELETE TO authenticated
USING (org_id = public.current_user_org_id());

-- social_conversations -------------------------------------------------------
ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view social_conversations" ON public.social_conversations;
DROP POLICY IF EXISTS "Authenticated users can insert social_conversations" ON public.social_conversations;
DROP POLICY IF EXISTS "Authenticated users can update social_conversations" ON public.social_conversations;
DROP POLICY IF EXISTS "Authenticated users can delete social_conversations" ON public.social_conversations;
DROP POLICY IF EXISTS "Users can view own org social_conversations" ON public.social_conversations;
DROP POLICY IF EXISTS "Users can insert own org social_conversations" ON public.social_conversations;
DROP POLICY IF EXISTS "Users can update own org social_conversations" ON public.social_conversations;
DROP POLICY IF EXISTS "Users can delete own org social_conversations" ON public.social_conversations;

CREATE POLICY "Users can view own org social_conversations"
ON public.social_conversations FOR SELECT TO authenticated
USING (org_id = public.current_user_org_id());

CREATE POLICY "Users can insert own org social_conversations"
ON public.social_conversations FOR INSERT TO authenticated
WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Users can update own org social_conversations"
ON public.social_conversations FOR UPDATE TO authenticated
USING (org_id = public.current_user_org_id())
WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Users can delete own org social_conversations"
ON public.social_conversations FOR DELETE TO authenticated
USING (org_id = public.current_user_org_id());

-- social_messages ------------------------------------------------------------
ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view social_messages" ON public.social_messages;
DROP POLICY IF EXISTS "Authenticated users can insert social_messages" ON public.social_messages;
DROP POLICY IF EXISTS "Users can view own org social_messages" ON public.social_messages;
DROP POLICY IF EXISTS "Users can insert own org social_messages" ON public.social_messages;

CREATE POLICY "Users can view own org social_messages"
ON public.social_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.social_conversations c
    WHERE c.id = social_messages.conversation_id
      AND c.org_id = public.current_user_org_id()
  )
);

CREATE POLICY "Users can insert own org social_messages"
ON public.social_messages FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.social_conversations c
    WHERE c.id = social_messages.conversation_id
      AND c.org_id = public.current_user_org_id()
  )
);

-- social_inbox_orders --------------------------------------------------------
ALTER TABLE public.social_inbox_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage social_inbox_orders" ON public.social_inbox_orders;
DROP POLICY IF EXISTS "Users can view own org social_inbox_orders" ON public.social_inbox_orders;
DROP POLICY IF EXISTS "Users can insert own org social_inbox_orders" ON public.social_inbox_orders;
DROP POLICY IF EXISTS "Users can update own org social_inbox_orders" ON public.social_inbox_orders;
DROP POLICY IF EXISTS "Users can delete own org social_inbox_orders" ON public.social_inbox_orders;

CREATE POLICY "Users can view own org social_inbox_orders"
ON public.social_inbox_orders FOR SELECT TO authenticated
USING (org_id = public.current_user_org_id());

CREATE POLICY "Users can insert own org social_inbox_orders"
ON public.social_inbox_orders FOR INSERT TO authenticated
WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Users can update own org social_inbox_orders"
ON public.social_inbox_orders FOR UPDATE TO authenticated
USING (org_id = public.current_user_org_id())
WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY "Users can delete own org social_inbox_orders"
ON public.social_inbox_orders FOR DELETE TO authenticated
USING (org_id = public.current_user_org_id());

-- Useful indexes for tenant-scoped access paths.
CREATE INDEX IF NOT EXISTS idx_user_roles_org_id ON public.user_roles(org_id);
CREATE INDEX IF NOT EXISTS idx_orders_org_id_created_at ON public.orders(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_org_id_created_at ON public.products(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_conversations_org_id_updated ON public.social_conversations(org_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_inbox_orders_org_id_created_at ON public.social_inbox_orders(org_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
