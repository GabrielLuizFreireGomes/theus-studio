import { db } from './db';
import { ensureAdmin, fitsHours, Problem, transaction } from './booking';
import { addDays, addMonth, dayAt, studioDay, weekday } from './time';
import type { Appointment, Campaign, Customer, Hours, Payment, Plan, Reward, Service } from './types';
import type { Identity } from './auth';
import { studioOffers } from './campaigns';

export async function agenda(day: string, days: number, person: Identity) {
  ensureAdmin(person);
  const sql = db();
  const [entries, [next]] = await Promise.all([
    sql<Appointment[]>`select a.*, c.name as customer_name from agenda a left join customers c on c.id = a.customer_id
      where a.starts_at < ${dayAt(addDays(day, days))} and a.ends_at > ${dayAt(day)}
      and (a.kind = 'booking' or a.status = 'scheduled') order by a.starts_at`,
    sql<Appointment[]>`select a.*, c.name as customer_name from agenda a join customers c on c.id = a.customer_id
      where a.kind = 'booking' and a.status = 'scheduled' and a.starts_at >= now()
      order by a.starts_at limit 1`,
  ]);
  return { entries, next: next ?? null };
}

export async function adminData(person: Identity) {
  ensureAdmin(person);
  const sql = db();
  const [services, hours, customers, settings, campaigns] = await Promise.all([
    sql<Service[]>`select * from services order by active desc, name`,
    sql<Hours[]>`select * from hours order by weekday`,
    sql<Customer[]>`select id, email, name, progress, plan_start, plan_end, contact_email, plan_requested_at
      from customers order by name`,
    studioOffers(sql),
    sql<Campaign[]>`select * from campaigns order by starts_at desc, id`,
  ]);
  const { loyalty_goal: goal, ...plan } = settings;
  return { services, hours, customers, goal, plan, campaigns };
}

export async function savePlan(plan: Plan) {
  await transaction(async (sql) => { await sql`update settings set ${sql(plan)} where id = true`; });
}

export async function saveCampaign(campaign: Omit<Campaign, 'id' | 'enabled'> & { id?: string }) {
  const { id, starts_at, ends_at, ...content } = campaign;
  const starts = new Date(starts_at);
  const ends = new Date(ends_at);
  if (ends <= starts || ends <= new Date()) throw new Problem('Informe um fim futuro, depois do início.');
  await transaction(async (sql) => {
    const values = { ...content, starts_at: starts, ends_at: ends };
    if (!id) { await sql`insert into campaigns ${sql(values)}`; return; }
    const result = await sql`update campaigns set ${sql(values)} where id = ${id} and starts_at > now() and enabled`;
    if (!result.count) throw new Problem('Apenas campanhas agendadas podem ser editadas.', 409);
  });
}

export async function disableCampaign(id: string) {
  await transaction(async (sql) => {
    await sql`update campaigns set enabled = false where id = ${id}`;
    await sql`delete from campaign_deliveries where campaign_id = ${id}`;
  });
}

export async function detail(id: string, person: Identity) {
  ensureAdmin(person);
  const sql = db();
  const [bookings, payments, rewards] = await Promise.all([
    sql<Appointment[]>`select * from agenda where customer_id = ${id} order by starts_at desc`,
    sql<Payment[]>`select * from payments where customer_id = ${id} order by paid_at desc`,
    sql<(Reward & { booking_id: string | null; used_at: string | null })[]>`select id, percent, booking_id, used_at
      from rewards where customer_id = ${id} order by earned_at desc`,
  ]);
  return { bookings, payments, rewards };
}

export async function saveCustomer(id: string, name: string, contactEmail: string | null) {
  const result = await db()`update customers set name = ${name}, contact_email = ${contactEmail} where id = ${id}`;
  if (!result.count) throw new Problem('Cliente não encontrado.', 404);
}

export async function saveService(service: Omit<Service, 'id'> & { id?: string }) {
  return await transaction(async (sql) => {
    const values = { name: service.name, description: service.description, price: service.price,
      duration: service.duration, is_cut: service.is_cut, active: service.active };
    if (service.id) {
      const result = await sql`update services set ${sql(values)} where id = ${service.id}`;
      if (!result.count) throw new Problem('Serviço não encontrado.', 404);
      return;
    }
    await sql`insert into services ${sql(values)}`;
  });
}

export async function saveHours(day: number, hours?: Hours) {
  return await transaction(async (sql) => {
    const future = await sql<Appointment[]>`select starts_at, ends_at from agenda
      where kind = 'booking' and status = 'scheduled' and starts_at >= now()`;
    if (future.some((entry) => weekday(studioDay(new Date(entry.starts_at))) === day &&
      (!hours || !fitsHours(hours, entry)))) {
      throw new Problem('O novo expediente conflita com uma reserva. Remarque ou cancele a reserva primeiro.', 409);
    }
    if (!hours) {
      await sql`delete from hours where weekday = ${day}`;
      return;
    }
    await sql`insert into hours ${sql(hours)} on conflict (weekday) do update
      set opens = excluded.opens, closes = excluded.closes, break_start = excluded.break_start, break_end = excluded.break_end`;
  });
}

export async function addBlock(title: string, startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (+start <= Date.now() || +end <= +start) throw new Problem('Escolha um período futuro com início e fim.');
  await transaction(async (sql) => {
    await sql`insert into agenda (kind, title, starts_at, ends_at) values ('block', ${title}, ${start}, ${end})`;
  });
}

export async function removeBlock(id: string) {
  await transaction(async (sql) => {
    await sql`update agenda set status = 'cancelled' where id = ${id} and kind = 'block'`;
  });
}

export async function changeGoal(goal: 5 | 10 | null, acceptReset: boolean) {
  await transaction(async (sql) => {
    const [current] = await sql<{ loyalty_goal: 5 | 10 | null }[]>`select loyalty_goal from settings`;
    if (current.loyalty_goal === goal) return;
    const [progress] = await sql`select id from customers where progress > 0 limit 1`;
    if (progress && !acceptReset) throw new Problem('Confirme o reinício dos ciclos em andamento.', 409);
    await sql`update customers set progress = 0 where progress > 0`;
    await sql`update settings set loyalty_goal = ${goal}`;
  });
}

export async function changeSubscription(id: string, action: 'payment' | 'end', requestId: string, expectedAmount?: number) {
  await transaction(async (sql) => {
    const [customer] = await sql<Customer[]>`select * from customers where id = ${id}`;
    if (!customer) throw new Problem('Cliente não encontrado.', 404);
    const today = studioDay();
    if (action === 'end') {
      await sql`update customers set plan_end = least(plan_end, ${today}::date)
        where id = ${id} and plan_end is not null`;
      return;
    }
    const [payment] = await sql`select id from payments where id = ${requestId}`;
    if (payment) return;
    const ongoing = customer.plan_start && customer.plan_end && today < customer.plan_end;
    const plan = await studioOffers(sql);
    if (!ongoing && !plan.plan_enabled) throw new Problem('Abra o plano para registrar novas assinaturas.', 409);
    if (expectedAmount !== undefined && expectedAmount !== plan.plan_price) throw new Problem('A mensalidade mudou. Abra a confirmação novamente.', 409);
    const start = ongoing ? customer.plan_end! : today;
    const end = addMonth(start);
    await sql`insert into payments (id, customer_id, period_start, period_end, amount)
      values (${requestId}, ${id}, ${start}, ${end}, ${plan.plan_price})`;
    await sql`update customers set plan_start = ${ongoing ? customer.plan_start : start}, plan_end = ${end},
      plan_paid_amount = ${plan.plan_price}, plan_requested_at = null
      where id = ${id}`;
  });
}
