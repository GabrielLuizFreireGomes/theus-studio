create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.agenda(id) on delete cascade,
  kind text not null check (kind in ('reminder', 'moved', 'cancelled')),
  starts_at timestamptz not null,
  due_at timestamptz not null,
  run_at timestamptz not null,
  attempts integer not null default 0,
  unique (booking_id, kind)
);
create index notification_jobs_run_idx on public.notification_jobs(run_at);

alter table public.push_subscriptions enable row level security;
alter table public.notification_jobs enable row level security;
revoke all on public.push_subscriptions, public.notification_jobs from anon, authenticated;

insert into public.notification_jobs (booking_id, kind, starts_at, due_at, run_at)
select id, 'reminder', starts_at, starts_at - interval '24 hours', starts_at - interval '24 hours'
from public.agenda
where kind = 'booking' and status = 'scheduled' and starts_at >= now() + interval '24 hours';
