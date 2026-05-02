-- Create social inbox tables required for WhatsApp / Facebook / Instagram bots.
-- All statements are idempotent (IF NOT EXISTS / EXCEPTION WHEN duplicate_object).

CREATE TABLE IF NOT EXISTS public.social_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  contact_name TEXT,
  contact_avatar TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count INT DEFAULT 0,
  org_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, contact_id)
);
ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_conv" ON public.social_conversations
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.social_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  message_type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_msg" ON public.social_messages
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.social_inbox_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.social_conversations(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  contact_name TEXT,
  contact_id TEXT,
  items JSONB,
  notes TEXT,
  total_price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  org_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_to_courier BOOLEAN DEFAULT FALSE,
  consignment_id TEXT,
  tracking_code TEXT,
  courier_status TEXT,
  courier_message TEXT,
  fraud_checked BOOLEAN DEFAULT FALSE,
  fraud_data JSONB,
  delivery_rate NUMERIC
);
ALTER TABLE public.social_inbox_orders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_orders" ON public.social_inbox_orders
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add org_id to pre-existing installs that created these tables without it
DO $$ BEGIN
  ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
