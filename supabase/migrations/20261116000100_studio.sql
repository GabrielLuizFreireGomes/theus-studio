create table public.settings (
  id boolean primary key default true check (id),
  loyalty_goal integer check (loyalty_goal in (5, 10))
);
insert into public.settings default values;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  duration integer not null check (duration between 5 and 480),
  price integer not null check (price >= 0),
  is_cut boolean not null default false,
  active boolean not null default true
);

create table public.hours (
  weekday integer primary key check (weekday between 1 and 7),
  opens integer not null check (opens >= 0),
  closes integer not null check (closes <= 1440 and closes > opens),
  break_start integer,
  break_end integer,
  check ((break_start is null and break_end is null) or
    (break_start is not null and break_end is not null and
     opens <= break_start and break_end <= closes and break_start < break_end))
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique,
  email text not null unique check (email = lower(email)),
  name text not null,
  progress integer not null default 0 check (progress >= 0),
  plan_start date,
  plan_end date
);

create table public.agenda (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('booking', 'block')),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  customer_id uuid references public.customers(id),
  service_id uuid references public.services(id),
  title text not null,
  price integer check (price >= 0),
  total integer check (total between 0 and price),
  is_cut boolean not null default false,
  covered boolean not null default false,
  request_id uuid unique,
  check ((kind = 'booking' and customer_id is not null and service_id is not null
    and price is not null and total is not null) or
    (kind = 'block' and customer_id is null and service_id is null)),
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status in ('scheduled', 'completed'))
);
create index agenda_customer_idx on public.agenda(customer_id, starts_at desc);
create index agenda_starts_idx on public.agenda(starts_at);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  percent integer not null check (percent in (50, 100)),
  earned_at timestamptz not null default now(),
  earned_booking uuid not null unique references public.agenda(id),
  booking_id uuid unique references public.agenda(id),
  used_at timestamptz
);
create index rewards_customer_idx on public.rewards(customer_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  amount integer not null default 10000 check (amount = 10000),
  paid_at timestamptz not null default now(),
  period_start date not null,
  period_end date not null check (period_end > period_start)
);
create index payments_customer_idx on public.payments(customer_id, paid_at desc);

-- The application accesses these tables through its server connection only.
alter table public.settings enable row level security;
alter table public.services enable row level security;
alter table public.hours enable row level security;
alter table public.customers enable row level security;
alter table public.agenda enable row level security;
alter table public.rewards enable row level security;
alter table public.payments enable row level security;
revoke all on public.settings, public.services, public.hours, public.customers,
  public.agenda, public.rewards, public.payments from anon, authenticated;
