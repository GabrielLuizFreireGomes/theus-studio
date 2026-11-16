alter table public.settings
  add column plan_enabled boolean not null default true,
  add column plan_name text not null default 'Plano mensal',
  add column plan_description text not null default 'Cortes ilimitados por mês, com agendamento conforme a disponibilidade.',
  add column plan_price integer not null default 10000 check (plan_price between 1 and 10000000);

alter table public.customers add column plan_paid_amount integer;
update public.customers c set plan_paid_amount =
  (select p.amount from public.payments p where p.customer_id = c.id order by p.paid_at desc limit 1)
where c.plan_end is not null;
alter table public.payments drop constraint payments_amount_check,
  add constraint payments_amount_check check (amount between 1 and 10000000);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  kind text not null check (kind in ('discount', 'loyalty', 'subscription')),
  percent integer,
  service_id uuid references public.services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  notify boolean not null default false,
  enabled boolean not null default true,
  queued_at timestamptz,
  check ((kind = 'discount' and percent is not null and percent between 1 and 100) or
    (kind <> 'discount' and percent is null and service_id is null))
);
alter table public.push_subscriptions add column offers boolean not null default false;
create table public.campaign_deliveries (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  device_id uuid not null references public.push_subscriptions(id) on delete cascade on update cascade,
  run_at timestamptz not null default now(),
  attempts integer not null default 0,
  primary key (campaign_id, device_id)
);
create index campaign_delivery_schedule on public.campaign_deliveries(run_at);
alter table public.campaigns enable row level security;
alter table public.campaign_deliveries enable row level security;
revoke all on public.campaigns, public.campaign_deliveries from anon, authenticated;
