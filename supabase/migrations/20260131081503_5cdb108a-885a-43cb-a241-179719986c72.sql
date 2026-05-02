-- Add fraud check columns to orders table
ALTER TABLE public.orders
ADD COLUMN fraud_checked BOOLEAN DEFAULT false,
ADD COLUMN fraud_data JSONB,
ADD COLUMN delivery_rate NUMERIC(5, 2);