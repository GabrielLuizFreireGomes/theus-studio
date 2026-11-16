import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { auth, identity } from '@/lib/auth';
import { account, availability, catalog, closeBooking, confirm, ensureAdmin, preview, Problem,
  registerCustomer, requestSubscription, transaction } from '@/lib/booking';
import { addBlock, adminData, agenda, changeGoal, changeSubscription, detail, disableCampaign, removeBlock, saveCampaign, saveCustomer, saveHours, savePlan, saveService } from '@/lib/admin';
import { validDay } from '@/lib/time';
import { sameOrigin } from '@/lib/app-origin';
import { pushDeviceCookie, removePushDevice } from '@/lib/push';

const uuid = z.uuid();
const date = z.string().refine(validDay);
const email = z.email().max(254).transform((value) => value.toLowerCase());
const name = z.string().trim().min(2).max(100);
const time = z.iso.datetime({ offset: true });
const price = z.number().int().min(0).max(10000000);
const booking = {
  serviceId: uuid, startsAt: time, appointmentId: uuid.optional(), rewardId: uuid.nullish(),
};
const clock = z.number().int().min(0).max(1440);
const hours = z.object({ opens: clock, closes: clock, break_start: clock.nullable(), break_end: clock.nullable() })
  .refine((value) => value.opens < value.closes &&
    (value.break_start === null && value.break_end === null ||
      value.break_start !== null && value.break_end !== null && value.opens <= value.break_start &&
      value.break_start < value.break_end && value.break_end <= value.closes));

const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('logout') }),
  z.object({ action: z.literal('profile'), name }),
  z.object({ action: z.literal('requestSubscription') }),
  z.object({ action: z.literal('editCustomer'), id: uuid, name, contactEmail: email.nullable() }),
  z.object({ action: z.literal('quote'), ...booking, email: email.optional() }),
  z.object({ action: z.literal('confirm'), ...booking, total: price, covered: z.boolean(),
    requestId: uuid, manual: z.object({ email, name }).optional() }),
  z.object({ action: z.enum(['cancel', 'complete', 'unblock']), id: uuid }),
  z.object({ action: z.literal('service'), service: z.object({ id: uuid.optional(), name,
    description: z.string().trim().max(240), duration: z.number().int().min(5).max(480),
    price, active: z.boolean(), is_cut: z.boolean() }) }),
  z.object({ action: z.literal('hours'), weekday: z.number().int().min(1).max(7), hours: hours.optional() }),
  z.object({ action: z.literal('block'), title: name, startsAt: time, endsAt: time }),
  z.object({ action: z.literal('goal'), goal: z.union([z.literal(5), z.literal(10), z.null()]), reset: z.boolean() }),
  z.object({ action: z.literal('payment'), id: uuid, requestId: uuid, amount: price }),
  z.object({ action: z.literal('end'), id: uuid, requestId: uuid }),
  z.object({ action: z.literal('plan'), plan: z.object({ plan_enabled: z.boolean(), plan_name: name,
    plan_description: z.string().trim().min(4).max(280), plan_price: price.min(1) }) }),
  z.object({ action: z.literal('campaign'), campaign: z.object({ id: uuid.optional(), title: name,
    description: z.string().trim().min(4).max(280), kind: z.enum(['discount', 'loyalty', 'subscription']),
    percent: z.number().int().min(1).max(100).nullable(), service_id: uuid.nullable(),
    starts_at: time, ends_at: time, notify: z.boolean() }).refine((item) => item.kind === 'discount'
      ? item.percent !== null : item.percent === null && item.service_id === null) }),
  z.object({ action: z.literal('disableCampaign'), id: uuid }),
]);

const result = (payload: unknown) => NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });

function failure(error: unknown) {
  if (error instanceof Problem) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: 'Confira os dados preenchidos e tente de novo.' }, { status: 400 });
  }
  if (typeof error === 'object' && error && 'code' in error && error.code === '23P01') {
    return NextResponse.json({ error: 'O período já está ocupado.', code: 'slot_unavailable' }, { status: 409 });
  }
  console.error('Studio request failed', error instanceof Error ? error.name : typeof error);
  return NextResponse.json({ error: 'Não foi possível carregar os dados. Tente novamente.' }, { status: 503 });
}

async function signedIn() {
  const person = await identity();
  if (!person) throw new Problem('Entre para continuar.', 401);
  return person;
}

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    switch (query.get('view')) {
      case 'catalog':
        await signedIn();
        return result(await catalog());
      case 'slots': {
        const person = await signedIn();
        const id = uuid.optional().parse(query.get('appointment') ?? undefined);
        return result(await availability(date.parse(query.get('day')), uuid.parse(query.get('service')), id, person));
      }
      case 'session': {
        const person = await identity();
        return result(person ? { email: person.email, admin: person.admin, account: await account(person) } : null);
      }
      case 'agenda':
        return result(await agenda(date.parse(query.get('day')), query.get('days') === '7' ? 7 : 1, await signedIn()));
      case 'admin': return result(await adminData(await signedIn()));
      case 'customer': return result(await detail(uuid.parse(query.get('id')), await signedIn()));
      default: throw new Problem('Página indisponível.', 404);
    }
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new Problem('Solicitação inválida.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Problem('Formato inválido.', 415);
    const input = command.parse(await request.json());
    if (input.action === 'logout') {
      const person = await identity();
      const jar = await cookies();
      const device = jar.get(pushDeviceCookie)?.value;
      if (person && device) await removePushDevice(person.id, device);
      jar.delete(pushDeviceCookie);
      const { error } = await (await auth()).signOut({ scope: 'local' });
      if (error) throw new Problem('Não foi possível sair. Tente novamente.', 503);
      return result({ ok: true });
    }
    const person = await signedIn();
    switch (input.action) {
      case 'profile': await transaction((sql) => registerCustomer(sql, person, input.name)); break;
      case 'requestSubscription': await requestSubscription(person); break;
      case 'quote': return result(await preview(input, person, input.email));
      case 'confirm': return result(await confirm(input, person, input.manual));
      case 'cancel':
      case 'complete': await closeBooking(input.id, input.action, person); break;
      default:
        ensureAdmin(person);
        switch (input.action) {
          case 'plan': await savePlan(input.plan); break;
          case 'campaign': await saveCampaign(input.campaign); break;
          case 'disableCampaign': await disableCampaign(input.id); break;
          case 'editCustomer': await saveCustomer(input.id, input.name, input.contactEmail); break;
          case 'service': await saveService(input.service); break;
          case 'hours': await saveHours(input.weekday, input.hours && { ...input.hours, weekday: input.weekday }); break;
          case 'block': await addBlock(input.title, input.startsAt, input.endsAt); break;
          case 'unblock': await removeBlock(input.id); break;
          case 'goal': await changeGoal(input.goal, input.reset); break;
          case 'payment': await changeSubscription(input.id, input.action, input.requestId, input.amount); break;
          case 'end': await changeSubscription(input.id, input.action, input.requestId); break;
        }
    }
    return result({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
