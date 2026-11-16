import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { agenda, changeGoal, changeSubscription, addBlock, saveCampaign, saveCustomer, saveHours, savePlan } from '../lib/admin';
import { account, availability, closeBooking, confirm, manualCustomer, preview, registerCustomer, requestSubscription, transaction } from '../lib/booking';
import { db } from '../lib/db';
import { visibleCampaigns } from '../lib/campaigns';
import { queueDueCampaigns } from '../lib/push';
import { addDays, addMonth, dayAt, studioDay, weekday } from '../lib/time';
import type { Service } from '../lib/types';

test('booking, access and benefits against a dedicated PostgreSQL database', async () => {
  const url = new URL(process.env.STUDIO_TEST_DATABASE_URL ?? '');
  assert.equal(url.pathname, '/theus_studio_test', 'Use a dedicated test database.');
  const schema = 'studio_test_' + randomUUID().replaceAll('-', '');
  url.searchParams.set('search_path', schema + ',public');
  process.env.DATABASE_URL = url.toString();
  const sql = db();
  try {
    await sql`create schema ${sql(schema)}`;
    const migration = readFileSync('supabase/migrations/20261116000100_studio.sql', 'utf8');
    await sql.unsafe(migration.replaceAll('public.', schema + '.'));
    const pushMigration = readFileSync('supabase/migrations/20261116000200_push.sql', 'utf8');
    await sql.unsafe(pushMigration.replaceAll('public.', schema + '.'));
    const customerMigration = readFileSync('supabase/migrations/20261117000100_customer_preferences.sql', 'utf8');
    await sql.unsafe(customerMigration.replaceAll('public.', schema + '.'));
    const campaignsMigration = readFileSync('supabase/migrations/20261117000200_campaigns.sql', 'utf8');
    await sql.unsafe(campaignsMigration.replaceAll('public.', schema + '.'));
    const admin = { id: randomUUID(), email: 'admin@example.test', admin: true };
    const first = { id: randomUUID(), email: 'one@example.test', admin: false };
    const second = { id: randomUUID(), email: 'two@example.test', admin: false };
    const customer = await transaction((tx) => registerCustomer(tx, first, 'Primeiro cliente'));
    await transaction((tx) => registerCustomer(tx, second, 'Segundo cliente'));
    const [cut] = await sql<Service[]>`insert into services (name, price, duration, is_cut)
      values ('Corte', 4500, 35, true) returning *`;
    const [beard] = await sql<Service[]>`insert into services (name, price, duration)
      values ('Barba', 3000, 25) returning *`;
    const migratedPerson = { id: randomUUID(), email: 'legacy@example.test', admin: false };
    const legacy = await transaction((tx) => manualCustomer(tx, migratedPerson.email, 'Cliente existente'));
    const historicalStart = dayAt(addDays(studioDay(), -24), 540);
    await sql`insert into agenda (kind, status, starts_at, ends_at, customer_id, service_id, title, price, total, is_cut)
      values ('booking', 'completed', ${historicalStart}, ${new Date(+historicalStart + 35 * 60000)},
      ${legacy.id}, ${cut.id}, 'Corte', 4500, 4500, true)`;
    const linked = await transaction((tx) => registerCustomer(tx, migratedPerson, 'Cliente reativado'));
    assert.equal(linked.id, legacy.id);
    assert.equal((await account(migratedPerson)).bookings[0].status, 'completed');
    await saveCustomer(legacy.id, 'Nome editado', 'contato@example.test');
    await requestSubscription(migratedPerson);
    const requested = (await account(migratedPerson)).customer!;
    assert.ok(requested.plan_requested_at);
    assert.equal(requested.email, migratedPerson.email);
    assert.equal(requested.contact_email, 'contato@example.test');
    await requestSubscription(migratedPerson);
    assert.equal(+new Date((await account(migratedPerson)).customer!.plan_requested_at!), +new Date(requested.plan_requested_at));
    await changeSubscription(legacy.id, 'payment', randomUUID());
    assert.equal((await account(migratedPerson)).customer?.plan_requested_at, null);
    await sql`insert into hours (weekday, opens, closes, break_start, break_end)
      select d, 540, 1080, 720, 780 from generate_series(1, 7) d`;
    const today = studioDay();
    const day = addDays(today, 1);
    const at = (minute: number, date = day) => dayAt(date, minute).toISOString();
    const slots = await availability(day, cut.id);
    assert.ok(slots.includes(at(540)));
    assert.ok(!slots.includes(at(705)));
    assert.ok(slots.includes(at(780)));

    async function book(minute: number, person = first, service = cut, date = day, rewardId?: string) {
      const draft = { serviceId: service.id, startsAt: at(minute, date), rewardId };
      const quote = await preview(draft, person);
      return confirm({ ...draft, total: quote.total, covered: quote.covered, requestId: randomUUID() }, person);
    }

    const competing = await Promise.allSettled([book(540), book(555, second, beard)]);
    assert.equal(competing.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(competing.filter((item) => item.status === 'rejected').length, 1);
    const initial = await book(615);
    const adjacent = await book(660, second, beard);
    await assert.rejects(closeBooking(initial.id, 'cancel', second), /não encontrado/);
    await assert.rejects(agenda(day, 1, first), /reservado/);
    await addBlock('Pausa', at(810), at(855));
    assert.ok(!(await availability(day, cut.id)).includes(at(795)));
    assert.ok((await availability(day, cut.id)).includes(at(855)));
    await assert.rejects(addBlock('Sobreposição', at(660), at(675)), { code: '23P01' });
    await assert.rejects(saveHours(weekday(day)), /conflita/);
    const conflicts = { serviceId: cut.id, startsAt: at(645), appointmentId: initial.id };
    const quote = await preview(conflicts, first);
    await assert.rejects(confirm({ ...conflicts, covered: quote.covered, total: quote.total, requestId: randomUUID() }, first),
      /não está mais livre/);
    const moved = { ...conflicts, startsAt: at(900) };
    assert.equal(new Date((await account(first)).bookings.find((item) => item.id === initial.id)!.starts_at).toISOString(), at(615));
    await confirm({ ...moved, total: quote.total, covered: quote.covered, requestId: randomUUID() }, first);
    assert.equal(new Date((await account(first)).bookings.find((item) => item.id === initial.id)!.starts_at).toISOString(), at(900));
    await closeBooking(adjacent.id, 'cancel', second);
    assert.ok((await availability(day, beard.id)).includes(at(660)));
    const intervalDay = addDays(day, 3);
    const twentyFiveMinutes = await book(540, first, beard, intervalDay);
    assert.equal(+new Date(twentyFiveMinutes.ends_at) - +new Date(twentyFiveMinutes.starts_at), 25 * 60000);
    const durationSlots = await availability(intervalDay, beard.id);
    assert.ok(!durationSlots.includes(at(555, intervalDay)));
    assert.ok(durationSlots.includes(at(570, intervalDay)));
    await assert.rejects(book(555, second, beard, intervalDay), { code: 'slot_unavailable' });

    async function completedCut(daysAgo: number, covered = false) {
      const from = dayAt(addDays(today, -daysAgo), 540);
      const [entry] = await sql<{ id: string }[]>`insert into agenda
        (kind, starts_at, ends_at, customer_id, service_id, title, price, total, is_cut, covered)
        values ('booking', ${from}, ${new Date(+from + 35 * 60000)}, ${customer.id}, ${cut.id},
        'Corte', 4500, ${covered ? 0 : 4500}, true, ${covered}) returning id`;
      await Promise.all([closeBooking(entry.id, 'complete', admin), closeBooking(entry.id, 'complete', admin)]);
    }

    assert.equal((await account(first)).goal, null);
    await changeGoal(5, false);
    await completedCut(16, true);
    assert.equal((await account(first)).customer!.progress, 0);
    for (let n = 1; n <= 5; n++) await completedCut(n);
    const earned = await account(first);
    assert.equal(earned.customer!.progress, 0);
    assert.deepEqual(earned.rewards.map((item) => item.percent), [50]);
    const rewardId = earned.rewards[0].id;
    const competingRedemptions = await Promise.allSettled([
      book(990, first, cut, day, rewardId), book(1020, first, cut, addDays(day, 1), rewardId),
    ]);
    const redemptions = competingRedemptions.filter((item) => item.status === 'fulfilled');
    assert.equal(redemptions.length, 1);
    assert.equal(redemptions[0].value.total, 2250);
    assert.equal((await account(first)).rewards.length, 0);
    const rewardMove = { appointmentId: redemptions[0].value.id, serviceId: cut.id, startsAt: at(930) };
    assert.equal((await preview(rewardMove, first)).rewardId, rewardId);
    assert.equal((await preview({ ...rewardMove, rewardId: null }, first)).total, 4500);
    await closeBooking(redemptions[0].value.id, 'cancel', first);
    assert.equal((await account(first)).rewards[0].id, rewardId);
    await completedCut(17);
    await assert.rejects(changeGoal(10, false), /reinício/);
    await changeGoal(10, true);
    for (let n = 6; n <= 15; n++) await completedCut(n);
    assert.deepEqual((await account(first)).rewards.map((item) => item.percent).sort(), [100, 50]);
    const redeem = await book(1020, first, cut, day, rewardId);
    const redeemedAt = dayAt(addDays(today, -18), 540);
    await sql`update agenda set starts_at = ${redeemedAt}, ends_at = ${new Date(+redeemedAt + 35 * 60000)} where id = ${redeem.id}`;
    await closeBooking(redeem.id, 'complete', admin);
    assert.deepEqual((await account(first)).rewards.map((item) => item.percent), [100]);
    assert.equal((await account(first)).customer?.progress, 0);

    const payment = randomUUID();
    await changeSubscription(customer.id, 'payment', payment);
    await changeSubscription(customer.id, 'payment', payment);
    assert.equal((await account(first)).customer!.plan_end, addMonth(today));
    await changeSubscription(customer.id, 'payment', randomUUID());
    assert.equal((await account(first)).customer!.plan_end, addMonth(addMonth(today)));
    const covered = await book(960);
    assert.equal(covered.total, 0);
    assert.equal(covered.covered, true);
    await changeSubscription(customer.id, 'end', randomUUID());
    const outside = await preview({ serviceId: cut.id, startsAt: at(1005), appointmentId: covered.id }, first);
    assert.equal(outside.total, 4500);
    assert.equal(outside.covered, false);
    assert.equal((await account(first)).bookings.find((item) => item.id === covered.id)!.total, 0);
    await changeSubscription(customer.id, 'payment', randomUUID());
    assert.equal((await account(first)).customer!.plan_end, addMonth(today));

    const delayedDay = addDays(today, 3);
    const scheduled = await book(540, first, cut, delayedDay);
    const [reminder] = await sql`select kind, due_at from notification_jobs where booking_id = ${scheduled.id}`;
    assert.equal(reminder.kind, 'reminder');
    assert.equal(new Date(reminder.due_at).toISOString(), at(540, addDays(delayedDay, -1)));
    const moveByBarber = { appointmentId: scheduled.id, serviceId: cut.id, startsAt: at(570, delayedDay) };
    const barberQuote = await preview(moveByBarber, admin);
    await confirm({ ...moveByBarber, total: barberQuote.total, covered: barberQuote.covered, requestId: randomUUID() }, admin);
    assert.deepEqual((await sql`select kind from notification_jobs where booking_id = ${scheduled.id} order by kind`)
      .map((job) => job.kind), ['moved', 'reminder']);
    await closeBooking(scheduled.id, 'cancel', admin);
    assert.deepEqual((await sql`select kind from notification_jobs where booking_id = ${scheduled.id}`)
      .map((job) => job.kind), ['cancelled']);

    await savePlan({ plan_enabled: false, plan_name: 'Clube Studio', plan_description: 'Cortes ilimitados.', plan_price: 12500 });
    await assert.rejects(requestSubscription(second), /fechado/);
    assert.ok((await account(first)).customer?.plan_end);
    assert.equal((await account(first)).customer?.plan_paid_amount, 10000);
    await assert.rejects(changeSubscription(customer.id, 'payment', randomUUID(), 10000), /mensalidade mudou/);
    await changeSubscription(customer.id, 'payment', randomUUID(), 12500);
    assert.equal((await account(first)).customer?.plan_paid_amount, 12500);
    const endsAt = at(1080, addDays(today, 6));
    const campaign = { title: 'Oferta de barba', description: 'Desconto automático no preço final.', kind: 'discount' as const,
      percent: 20, service_id: beard.id, starts_at: new Date(Date.now() - 60_000).toISOString(), ends_at: endsAt, notify: true };
    await saveCampaign({ ...campaign, title: 'Oferta futura', starts_at: at(540, addDays(today, 5)) });
    await saveCampaign(campaign);
    assert.deepEqual((await visibleCampaigns(sql)).map((item) => item.title), [campaign.title]);
    assert.equal((await preview({ serviceId: beard.id, startsAt: at(630, addDays(today, 5)) }, second)).total, 2400);
    await sql`insert into push_subscriptions (user_id, endpoint, p256dh, auth, offers) values
      (${first.id}, 'https://fcm.googleapis.com/fcm/send/fixture1', 'fixture', 'fixture', true),
      (${second.id}, 'https://fcm.googleapis.com/fcm/send/fixture2', 'fixture', 'fixture', false)`;
    await Promise.all([queueDueCampaigns(), queueDueCampaigns()]);
    const deliveries = await sql`select p.user_id from campaign_deliveries d join push_subscriptions p on p.id = d.device_id`;
    assert.deepEqual(deliveries.map((item) => item.user_id), [first.id]);
  } finally {
    await sql`drop schema if exists ${sql(schema)} cascade`;
    await sql.end();
  }
});
