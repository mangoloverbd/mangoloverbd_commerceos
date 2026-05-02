-- Create orders table for storing Shopify orders with local status
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_order_id BIGINT UNIQUE NOT NULL,
  order_number TEXT NOT NULL,
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  product TEXT,
  quantity INTEGER,
  price NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users (admin dashboard)
CREATE POLICY "Authenticated users can view all orders" 
ON public.orders 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert orders" 
ON public.orders 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update orders" 
ON public.orders 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete orders" 
ON public.orders 
FOR DELETE 
TO authenticated
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();