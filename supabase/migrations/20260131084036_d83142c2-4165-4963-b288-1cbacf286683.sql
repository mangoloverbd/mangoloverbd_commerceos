-- Add courier-related columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS courier_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS consignment_id bigint DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tracking_code text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS courier_message text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS sent_to_courier boolean DEFAULT false;