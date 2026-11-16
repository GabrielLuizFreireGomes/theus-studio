import { db, type Database } from './db';
import { addDays, dayAt, minutesAt, overlaps, studioDay, weekday } from './time';
import type { Account, Appointment, Customer, Hours, Quote, Reward, Service } from './types';
import type { Identity } from './auth';
import { syncBookingNotifications } from './notification-jobs';
import { discountFor, studioOffers } from './campaigns';

export class Problem extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'invalid') {
    super(message);
  }
}

type CustomerRow = Customer & { auth_id: string | null };
type BookingInput = { serviceId: string; startsAt: string; appointmentId?: string; rewardId?: string | null };
type Confirmation = BookingInput & { total: number; requestId: string; covered: boolean };

export function ensureAdmin(person: Identity | null) {
  if (!person?.admin) throw new Problem('Acesso reservado ao barbeiro.', 403);
}

export async function transaction<T>(write: (tx: Database) => Promise<T>): Promise<T> {
  return await db().begin(async (tx) => {
    await tx`select id from settings where id = true for update`;
    return await write(tx);
  }) as T;
}

export async function findCustomer(sql: Database, person: Identity) {
  const [customer] = await sql<CustomerRow[]>`select * from customers where auth_id = ${person.id}
    or (auth_id is null and email = ${person.email}) order by auth_id nulls last limit 1`;
  return customer;
}

export async function registerCustomer(sql: Database, person: Identity, name: string) {
  const current = await findCustomer(sql, person);
  if (current?.auth_id) return current;
  if (current) {
    const [linked] = await sql<Customer[]>`update customers set auth_id = ${person.id}
      where id = ${current.id} returning *`;
    return linked;
  }
  const [created] = await sql<Customer[]>`insert into customers (email, name, auth_id)
    values (${person.email}, ${name}, ${person.id}) returning *`;
  return created;
}

export async function requestSubscription(person: Identity) {
  await transaction(async (sql) => {
    if (!(await studioOffers(sql)).plan_enabled) throw new Problem('O plano está fechado para novas assinaturas.', 409);
    const customer = await registerCustomer(sql, person, person.name || person.email.split('@')[0]);
    const today = studioDay();
    if (customer.plan_start && customer.plan_start <= today && customer.plan_end && today < customer.plan_end) return;
    await sql`update customers set plan_requested_at = coalesce(plan_requested_at, now()) where id = ${customer.id}`;
  });
}

export async function manualCustomer(sql: Database, email: string, name: string) {
  const [existing] = await sql<Customer[]>`select * from customers where email = ${email}`;
  if (existing) return existing;
  const [created] = await sql<Customer[]>`insert into customers (email, name) values (${email}, ${name}) returning *`;
  return created;
}

async function rewardsFor(sql: Database, customer: Customer | undefined | null, appointmentId?: string) {
  if (!customer) return [];
  return await sql<(Reward & { booking_id: string | null })[]>`select id, percent, booking_id from rewards where customer_id = ${customer.id}
     and used_at is null and (booking_id is null or booking_id = ${appointmentId ?? null})
     order by earned_at, id`;
}

export async function account(person: Identity): Promise<Account> {
  const sql = db();
  const [customer, settings] = await Promise.all([
    findCustomer(sql, person),
    studioOffers(sql),
  ]);
  const { loyalty_goal: goal, ...plan } = settings;
  if (!customer) return { customer: null, goal, plan, bookings: [], rewards: [] };
  const [bookings, rewards] = await Promise.all([
    sql<Appointment[]>`select * from agenda where customer_id = ${customer.id} order by starts_at desc`,
    rewardsFor(sql, customer),
  ]);
  const { auth_id: _, ...profile } = customer;
  return { customer: profile, goal, plan, bookings, rewards: rewards.map(({ id, percent }) => ({ id, percent })) };
}

export async function catalog() {
  return await db()<Service[]>`select * from services where active order by is_cut desc, name`;
}

function verifyWindow(day: string) {
  const today = studioDay();
  if (day < today || day >= addDays(today, 30)) {
    throw new Problem('Escolha uma data nos próximos 30 dias.');
  }
}

async function existingBooking(sql: Database, id: string, person: Identity | null) {
  if (!person) throw new Problem('Entre para acessar seu agendamento.', 401);
  const [booking] = await sql<Appointment[]>`select * from agenda where id = ${id} and kind = 'booking'`;
  const owner = person.admin ? null : await findCustomer(sql, person);
  if (!booking || (!person.admin && owner?.id !== booking.customer_id)) {
    throw new Problem('Agendamento não encontrado.', 404);
  }
  return booking;
}

function requireFuture(booking: Appointment) {
  if (booking.status !== 'scheduled' || new Date(booking.starts_at).getTime() <= Date.now()) {
    throw new Problem('Este agendamento já passou ou foi encerrado.', 409);
  }
}

async function serviceFor(sql: Database, serviceId: string, existing?: Appointment) {
  if (existing) {
    const duration = (new Date(existing.ends_at).getTime() - new Date(existing.starts_at).getTime()) / 60000;
    return { id: existing.service_id!, name: existing.title, duration, price: existing.price!, is_cut: existing.is_cut };
  }
  const [service] = await sql<Service[]>`select * from services where id = ${serviceId} and active`;
  if (!service) throw new Problem('Este serviço está indisponível.', 409, 'service_unavailable');
  return service;
}

async function openSlots(sql: Database, day: string, duration: number, ignore?: string) {
  verifyWindow(day);
  const [hours] = await sql<Hours[]>`select * from hours where weekday = ${weekday(day)}`;
  if (!hours) return [];
  const start = dayAt(day);
  const end = dayAt(addDays(day, 1));
  const occupied = await sql<Pick<Appointment, 'starts_at' | 'ends_at'>[]>`select starts_at, ends_at from agenda
     where status in ('scheduled', 'completed') and starts_at < ${end} and ends_at > ${start}
     and (${ignore ?? null}::uuid is null or id <> ${ignore ?? null})`;
  const slots: string[] = [];
  const now = Date.now();
  for (let minute = Math.ceil(hours.opens / 15) * 15; minute + duration <= hours.closes; minute += 15) {
    if (hours.break_start !== null && overlaps(minute, minute + duration, hours.break_start, hours.break_end!)) continue;
    const from = dayAt(day, minute);
    const to = dayAt(day, minute + duration);
    if (from.getTime() <= now || occupied.some((row) =>
      overlaps(+from, +to, +new Date(row.starts_at), +new Date(row.ends_at)))) continue;
    slots.push(from.toISOString());
  }
  return slots;
}

export async function availability(day: string, serviceId: string, appointmentId?: string, person?: Identity | null) {
  const sql = db();
  const existing = appointmentId ? await existingBooking(sql, appointmentId, person ?? null) : undefined;
  if (existing) requireFuture(existing);
  const service = await serviceFor(sql, serviceId, existing);
  return await openSlots(sql, day, service.duration, existing?.id);
}

async function calculateQuote(sql: Database, service: Awaited<ReturnType<typeof serviceFor>>, startsAt: string,
  customer?: Customer | null, rewardId?: string | null, existing?: Appointment): Promise<Quote> {
  const day = studioDay(new Date(startsAt));
  const covered = Boolean(service.is_cut && customer?.plan_start && customer.plan_end &&
    customer.plan_start <= day && day < customer.plan_end);
  const rewards = service.is_cut && !covered ? await rewardsFor(sql, customer, existing?.id) : [];
  const reward = rewardId === undefined && existing
    ? rewards.find((item) => item.booking_id === existing.id)
    : rewards.find((item) => item.id === rewardId);
  if (rewardId && !reward && !covered) throw new Problem('Este benefício já foi reservado. Revise o valor.', 409, 'price_changed');
  const promotion = covered || reward ? undefined : await discountFor(sql, service.id, startsAt);
  return { price: service.price, total: covered ? 0 : Math.round(service.price * (100 - (reward?.percent ?? promotion?.percent ?? 0)) / 100),
    covered, rewardId: reward?.id ?? null, rewards: rewards.map(({ id, percent }) => ({ id, percent })), promotion };
}

async function context(sql: Database, input: BookingInput, person: Identity, customer?: Customer) {
  const existing = input.appointmentId ? await existingBooking(sql, input.appointmentId, person) : undefined;
  if (existing) requireFuture(existing);
  const service = await serviceFor(sql, input.serviceId, existing);
  const profile = existing
    ? (await sql<Customer[]>`select * from customers where id = ${existing.customer_id}`)[0]
    : customer ?? await findCustomer(sql, person);
  const quote = await calculateQuote(sql, service, input.startsAt, profile, input.rewardId, existing);
  return { existing, service, profile, quote };
}

export async function preview(input: BookingInput, person: Identity, email?: string) {
  const sql = db();
  if (email) ensureAdmin(person);
  const manual = email ? (await sql<Customer[]>`select * from customers where email = ${email}`)[0] : undefined;
  if (email && !manual && !input.appointmentId) {
    return await calculateQuote(sql, await serviceFor(sql, input.serviceId), input.startsAt, null);
  }
  return (await context(sql, input, person, manual)).quote;
}

export async function confirm(input: Confirmation, person: Identity, manual?: { email: string; name: string }) {
  if (manual) ensureAdmin(person);
  return await transaction(async (sql) => {
    const customer = manual ? await manualCustomer(sql, manual.email, manual.name) : undefined;
    if (!input.appointmentId) {
      const [previous] = await sql<Appointment[]>`select * from agenda where request_id = ${input.requestId}`;
      if (previous) {
        const owner = customer ?? await findCustomer(sql, person);
        if (owner?.id === previous.customer_id) return previous;
        throw new Problem('Atualize a página e tente de novo.', 409);
      }
    }
    const { existing, service, profile, quote } = await context(sql, input, person, customer);
    if (!profile) throw new Problem('Informe seu nome e confirme seu e-mail.', 409);
    if (quote.total !== input.total || quote.covered !== input.covered ||
      (input.rewardId !== undefined && quote.rewardId !== input.rewardId)) {
      throw new Problem('O valor ou benefício mudou. Confira o novo total.', 409, 'price_changed');
    }
    const startsAt = new Date(input.startsAt);
    const slots = await openSlots(sql, studioDay(startsAt), service.duration, existing?.id);
    if (!slots.includes(startsAt.toISOString())) {
      throw new Problem('Este horário não está mais livre. Escolha outro.', 409, 'slot_unavailable');
    }
    const endsAt = new Date(+startsAt + service.duration * 60000);
    const [booking] = existing
      ? await sql<Appointment[]>`update agenda set starts_at = ${startsAt}, ends_at = ${endsAt},
          total = ${quote.total}, covered = ${quote.covered} where id = ${existing.id} returning *`
      : await sql<Appointment[]>`insert into agenda
         (kind, starts_at, ends_at, service_id, customer_id, title, price, total, is_cut, covered, request_id)
         values ('booking', ${startsAt}, ${endsAt}, ${service.id}, ${profile.id}, ${service.name},
         ${quote.price}, ${quote.total}, ${service.is_cut}, ${quote.covered}, ${input.requestId}) returning *`;
    await sql`update rewards set booking_id = null where booking_id = ${booking.id}
      and used_at is null and id is distinct from ${quote.rewardId}`;
    if (quote.rewardId) await sql`update rewards set booking_id = ${booking.id} where id = ${quote.rewardId}`;
    if (!existing || +new Date(existing.starts_at) !== +startsAt) {
      await syncBookingNotifications(sql, booking, Boolean(existing && person.admin));
    }
    return booking;
  });
}

export async function closeBooking(id: string, action: 'cancel' | 'complete', person: Identity) {
  if (action === 'complete') ensureAdmin(person);
  return await transaction(async (sql) => {
    const booking = await existingBooking(sql, id, person);
    const status = action === 'cancel' ? 'cancelled' : 'completed';
    if (booking.status === status) return;
    if (booking.status !== 'scheduled') throw new Problem('Este atendimento já foi encerrado.', 409);
    if (action === 'cancel' && !person.admin) requireFuture(booking);
    if (action === 'complete' && +new Date(booking.starts_at) > Date.now()) {
      throw new Problem('Conclua o atendimento a partir do horário agendado.');
    }
    await sql`update agenda set status = ${status} where id = ${id}`;
    await syncBookingNotifications(sql, { ...booking, status }, action === 'cancel' && person.admin);
    if (action === 'cancel') {
      await sql`update rewards set booking_id = null where booking_id = ${id} and used_at is null`;
      return;
    }
    const [used] = await sql`update rewards set used_at = now() where booking_id = ${id} returning id`;
    if (used || !booking.is_cut || booking.covered || booking.price !== booking.total || !booking.price) return;
    const [{ loyalty_goal: goal }] = await sql<{ loyalty_goal: 5 | 10 | null }[]>`select loyalty_goal from settings`;
    if (!goal) return;
    const [customer] = await sql<Customer[]>`update customers set progress = progress + 1
      where id = ${booking.customer_id} returning *`;
    if (customer.progress < goal) return;
    await sql`update customers set progress = 0 where id = ${customer.id}`;
    await sql`insert into rewards (customer_id, percent, earned_booking)
      values (${customer.id}, ${goal === 5 ? 50 : 100}, ${id})`;
  });
}

export function fitsHours(hours: Hours, entry: Pick<Appointment, 'starts_at' | 'ends_at'>) {
  const start = minutesAt(entry.starts_at);
  const end = studioDay(new Date(entry.ends_at)) === studioDay(new Date(entry.starts_at)) ? minutesAt(entry.ends_at) : 1440;
  return start >= hours.opens && end <= hours.closes && (hours.break_start === null ||
    !overlaps(start, end, hours.break_start, hours.break_end!));
}
