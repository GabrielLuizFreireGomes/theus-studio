alter table public.customers
  add column contact_email text,
  add column plan_requested_at timestamptz;
