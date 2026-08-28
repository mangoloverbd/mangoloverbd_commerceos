-- ============================================================
-- ZAIR — Single-Tenant Database Setup
-- Run this entire script in your new Supabase project's SQL Editor
-- (Project Settings → SQL Editor → New Query → paste → Run)
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE public.app_role AS ENUM ('admin', 'team_member');

-- ─── Utility Functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Returns true if the given user has the given role
CREATE OR REPLACE FUNCTION public.has_role(_user_id TEXT, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- ─── user_roles ───────────────────────────────────────────────────────────────

CREATE TABLE public.user_roles (
  id         UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT     NOT NULL UNIQUE,
  role       app_role NOT NULL DEFAULT 'team_member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read user_roles"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_all_user_roles"
  ON public.user_roles TO service_role USING (true) WITH CHECK (true);

-- ─── app_settings ─────────────────────────────────────────────────────────────
-- Key-value store for all integration credentials and business config.
-- Keys are plain strings (e.g. "shopify_store_url") — no org prefix needed.

CREATE TABLE public.app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read app_settings"
  ON public.app_settings FOR SELECT
  USING (public.has_role(auth.uid()::text, 'admin'));

CREATE POLICY "Admins can insert app_settings"
  ON public.app_settings FOR INSERT
  WITH CHECK (public.has_role(auth.uid()::text, 'admin'));

CREATE POLICY "Admins can update app_settings"
  ON public.app_settings FOR UPDATE
  USING (public.has_role(auth.uid()::text, 'admin'));

CREATE POLICY "service_role_all_settings"
  ON public.app_settings TO service_role USING (true) WITH CHECK (true);

-- ─── orders ───────────────────────────────────────────────────────────────────
-- Shopify-synced orders.

CREATE TABLE public.orders (
  id                 UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id   BIGINT   UNIQUE NOT NULL,
  order_number       TEXT     NOT NULL,
  customer_name      TEXT,
  phone              TEXT,
  address            TEXT,
  product            TEXT,
  quantity           INT,
  price              NUMERIC,
  status             TEXT     NOT NULL DEFAULT 'pending',
  fulfillment_status TEXT,
  fraud_checked      BOOLEAN  DEFAULT FALSE,
  fraud_data         JSONB,
  delivery_rate      NUMERIC(5,2),
  sent_to_courier    BOOLEAN  DEFAULT FALSE,
  consignment_id     TEXT,
  courier_status     TEXT,
  tracking_code      TEXT,
  courier_message    TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view orders"
  ON public.orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert orders"
  ON public.orders FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update orders"
  ON public.orders FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete orders"
  ON public.orders FOR DELETE TO authenticated USING (true);

CREATE POLICY "service_role_all_orders"
  ON public.orders TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live order updates in the dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- ─── products ─────────────────────────────────────────────────────────────────

CREATE TABLE public.products (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT    NOT NULL,
  price      NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage products"
  ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_products"
  ON public.products TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── social_conversations ─────────────────────────────────────────────────────
-- One row per unique contact per platform (Facebook, Instagram, WhatsApp).

CREATE TABLE public.social_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform        TEXT NOT NULL,
  contact_id      TEXT NOT NULL,
  contact_name    TEXT,
  contact_avatar  TEXT,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count    INT  DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, contact_id)
);

ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view social_conversations"
  ON public.social_conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert social_conversations"
  ON public.social_conversations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update social_conversations"
  ON public.social_conversations FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete social_conversations"
  ON public.social_conversations FOR DELETE TO authenticated USING (true);

CREATE POLICY "service_role_all_social_conv"
  ON public.social_conversations TO service_role USING (true) WITH CHECK (true);

-- ─── social_messages ──────────────────────────────────────────────────────────
-- Full message history per conversation.

CREATE TABLE public.social_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.social_conversations(id) ON DELETE CASCADE,
  sender          TEXT NOT NULL,       -- 'user' | 'bot'
  content         TEXT,
  image_url       TEXT,
  message_type    TEXT DEFAULT 'text',
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view social_messages"
  ON public.social_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert social_messages"
  ON public.social_messages FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "service_role_all_social_msg"
  ON public.social_messages TO service_role USING (true) WITH CHECK (true);

-- ─── social_inbox_orders ──────────────────────────────────────────────────────
-- Orders captured from WhatsApp / Facebook / Instagram conversations.

CREATE TABLE public.social_inbox_orders (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID    REFERENCES public.social_conversations(id) ON DELETE SET NULL,
  platform        TEXT    NOT NULL,
  contact_name    TEXT,
  contact_id      TEXT,
  items           JSONB,
  notes           TEXT,
  total_price     NUMERIC DEFAULT 0,
  status          TEXT    DEFAULT 'pending',
  sent_to_courier BOOLEAN DEFAULT FALSE,
  consignment_id  TEXT,
  tracking_code   TEXT,
  courier_status  TEXT,
  courier_message TEXT,
  fraud_checked   BOOLEAN DEFAULT FALSE,
  fraud_data      JSONB,
  delivery_rate   NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.social_inbox_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage social_inbox_orders"
  ON public.social_inbox_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_social_orders"
  ON public.social_inbox_orders TO service_role USING (true) WITH CHECK (true);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_orders_status          ON public.orders(status);
CREATE INDEX idx_orders_created_at      ON public.orders(created_at DESC);
CREATE INDEX idx_orders_shopify_id      ON public.orders(shopify_order_id);
CREATE INDEX idx_social_conv_platform   ON public.social_conversations(platform);
CREATE INDEX idx_social_conv_updated    ON public.social_conversations(last_message_at DESC);
CREATE INDEX idx_social_msg_conv        ON public.social_messages(conversation_id);
CREATE INDEX idx_inbox_orders_platform  ON public.social_inbox_orders(platform);
CREATE INDEX idx_inbox_orders_status    ON public.social_inbox_orders(status);
CREATE INDEX idx_inbox_orders_conv      ON public.social_inbox_orders(conversation_id);

-- ─── Reload PostgREST schema cache ────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
