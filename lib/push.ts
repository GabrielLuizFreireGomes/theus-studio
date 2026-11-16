import { sendNotification, WebPushError } from 'web-push';
import { db } from './db';
import { approvedPushEndpoint } from './push-policy';

const copy = {
  reminder: 'Você tem um horário marcado amanhã.',
  moved: 'Seu horário foi alterado. Confira em Meus horários.',
  cancelled: 'Um horário seu foi cancelado. Confira em Meus horários.',
};

const cookieName = 'theus-push-device';
export { cookieName as pushDeviceCookie };
export const deviceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pushConfig() {
  const { VAPID_SUBJECT: subject, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, PUSH_JOB_SECRET: secret } = process.env;
  return subject && publicKey && privateKey && secret ? { subject, publicKey, privateKey, secret } : null;
}

export async function removePushDevice(userId: string, id: string) {
  if (deviceIdPattern.test(id)) await db()`delete from push_subscriptions where id = ${id} and user_id = ${userId}`;
}

type Job = { id: string; booking_id: string; starts_at: Date; attempts: number; kind: keyof typeof copy };
type Device = { id: string; endpoint: string; p256dh: string; auth: string };

export async function sendDueNotifications(config: NonNullable<ReturnType<typeof pushConfig>>) {
  const sql = db();
  await sql`delete from notification_jobs where due_at < now() - interval '2 hours'
    or (attempts >= 5 and run_at <= now())`;
  const jobs = await sql<Job[]>`with next as (
    select id from notification_jobs where run_at <= now() and attempts < 5
    order by run_at limit 15 for update skip locked
  )
  update notification_jobs j set run_at = now() + interval '5 minutes', attempts = attempts + 1
  from next where j.id = next.id returning j.*`;
  const [results, campaigns] = await Promise.all([
    Promise.allSettled(jobs.map((job) => deliver(job, config))),
    sendCampaigns(config),
  ]);
  return { claimed: jobs.length, completed: results.filter((result) => result.status === 'fulfilled' && result.value).length, campaigns };
}

async function deliver(job: Job, config: NonNullable<ReturnType<typeof pushConfig>>) {
  const sql = db();
  const devices = await sql<Device[]>`select s.id, s.endpoint, s.p256dh, s.auth from notification_jobs j
    join agenda a on a.id = j.booking_id join customers c on c.id = a.customer_id
    join push_subscriptions s on s.user_id = c.auth_id
    where j.id = ${job.id} and a.starts_at = j.starts_at and a.starts_at > now()
    and a.status = ${job.kind === 'cancelled' ? 'cancelled' : 'scheduled'}`;
  const payload = JSON.stringify({ body: copy[job.kind], tag: 'studio-' + job.booking_id });
  const results = await Promise.all(devices.map((device) => sendToDevice(device, payload, config)));
  const completed = results.every(Boolean);
  if (completed) await sql`delete from notification_jobs where id = ${job.id} and attempts = ${job.attempts}`;
  return completed;
}

async function sendToDevice(device: Device, payload: string, config: NonNullable<ReturnType<typeof pushConfig>>) {
  if (!approvedPushEndpoint(device.endpoint)) {
    await db()`delete from push_subscriptions where id = ${device.id}`;
    return true;
  }
  try {
    await sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      payload, { vapidDetails: config, TTL: 1800, timeout: 4500 });
    return true;
  } catch (failure) {
    const code = failure instanceof WebPushError ? failure.statusCode : null;
    if (code === 404 || code === 410) {
      await db()`delete from push_subscriptions where id = ${device.id}`;
      return true;
    }
    console.warn('Studio push delivery failed', code ?? 'network');
    return false;
  }
}

export async function queueDueCampaigns() {
  return await db()`with released as (
    update campaigns c set queued_at = now() from settings s
    where c.enabled and c.notify and c.queued_at is null and c.starts_at <= now() and c.ends_at > now()
      and (c.kind <> 'subscription' or s.plan_enabled) and (c.kind <> 'loyalty' or s.loyalty_goal is not null)
      and (c.service_id is null or exists (select 1 from services v where v.id = c.service_id and v.active))
    returning c.id
  )
  insert into campaign_deliveries (campaign_id, device_id)
  select r.id, p.id from released r cross join push_subscriptions p
  where p.offers on conflict do nothing`;
}

async function sendCampaigns(config: NonNullable<ReturnType<typeof pushConfig>>) {
  await queueDueCampaigns();
  const sql = db();
  await sql`delete from campaign_deliveries d using campaigns c, push_subscriptions p
    where d.campaign_id = c.id and d.device_id = p.id and
    (c.ends_at <= now() or not c.enabled or not p.offers or (d.attempts >= 5 and d.run_at <= now()))`;
  const jobs = await sql<{ campaign_id: string; device_id: string; attempts: number }[]>`with next as (
    select campaign_id, device_id from campaign_deliveries
    where run_at <= now() and attempts < 5 order by run_at limit 20 for update skip locked
  ) update campaign_deliveries d set attempts = attempts + 1, run_at = now() + interval '5 minutes'
    from next where d.campaign_id = next.campaign_id and d.device_id = next.device_id returning d.*`;
  const results = await Promise.allSettled(jobs.map(async (job) => {
    const [target] = await sql<(Device & { title: string; description: string; kind: string })[]>`
      select p.id, p.endpoint, p.p256dh, p.auth, c.title, c.description, c.kind
      from campaign_deliveries d join campaigns c on c.id = d.campaign_id
      join push_subscriptions p on p.id = d.device_id cross join settings s
      where d.campaign_id = ${job.campaign_id} and d.device_id = ${job.device_id} and p.offers
      and c.enabled and now() >= c.starts_at and now() < c.ends_at
      and (c.kind <> 'subscription' or s.plan_enabled) and (c.kind <> 'loyalty' or s.loyalty_goal is not null)
      and (c.service_id is null or exists (select 1 from services v where v.id = c.service_id and v.active))`;
    if (target && !await sendToDevice(target, JSON.stringify({ title: target.title, body: target.description,
      tag: 'offer-' + job.campaign_id, destination: target.kind }), config)) return false;
    await sql`delete from campaign_deliveries where campaign_id = ${job.campaign_id}
      and device_id = ${job.device_id} and attempts = ${job.attempts}`;
    return true;
  }));
  return results.filter((item) => item.status === 'fulfilled' && item.value).length;
}
