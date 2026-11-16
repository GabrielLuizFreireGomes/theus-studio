import type { Database } from './db';
import type { Campaign, Plan } from './types';

export async function studioOffers(sql: Database) {
  const [settings] = await sql<(Plan & { loyalty_goal: 5 | 10 | null })[]>`
    select loyalty_goal, plan_enabled, plan_name, plan_description, plan_price from settings`;
  return settings;
}

export async function visibleCampaigns(sql: Database) {
  return await sql<Campaign[]>`select c.id, c.title, c.description, c.kind, c.percent, c.service_id,
      c.starts_at, c.ends_at, c.notify, c.enabled from campaigns c cross join settings s
    where c.enabled and now() >= c.starts_at and now() < c.ends_at
      and (c.kind <> 'subscription' or s.plan_enabled) and (c.kind <> 'loyalty' or s.loyalty_goal is not null)
      and (c.service_id is null or exists (select 1 from services v where v.id = c.service_id and v.active))
    order by c.starts_at desc, c.id`;
}

export async function discountFor(sql: Database, serviceId: string, startsAt: string) {
  const [campaign] = await sql<{ title: string; percent: number }[]>`select title, percent from campaigns
    where kind = 'discount' and enabled and now() >= starts_at and now() < ends_at
      and ${new Date(startsAt)} >= starts_at and ${new Date(startsAt)} < ends_at
      and (service_id is null or service_id = ${serviceId})
    order by percent desc, starts_at desc, id limit 1`;
  return campaign;
}
