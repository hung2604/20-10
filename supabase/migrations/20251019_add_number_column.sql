-- Add number column to orders table for lucky number
ALTER TABLE public.orders 
ADD COLUMN number INTEGER;

-- Add unique constraint to ensure each number can only be used once
ALTER TABLE public.orders
ADD CONSTRAINT orders_number_key UNIQUE (number);

-- Add comment to describe the column
COMMENT ON COLUMN public.orders.number IS 'Lucky number (1-8) for female users to receive gifts, unique per order';

