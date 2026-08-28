-- Add fulfillment_status column to track Shopify fulfillment state
ALTER TABLE public.orders
ADD COLUMN fulfillment_status text DEFAULT NULL;