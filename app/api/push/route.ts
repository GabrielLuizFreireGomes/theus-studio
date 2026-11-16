import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/app-origin';
import { identity, sessionCookieOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { approvedPushEndpoint } from '@/lib/push-policy';
import { deviceIdPattern, pushConfig, pushDeviceCookie, removePushDevice } from '@/lib/push';

const key = (length: number) => z.string().length(length).regex(/^[A-Za-z0-9_-]+$/);
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('disable') }),
  z.object({ action: z.literal('offers'), enabled: z.boolean() }),
  z.object({ action: z.literal('enable'), endpoint: z.string().max(1800).refine(approvedPushEndpoint),
    keys: z.object({ p256dh: key(87), auth: key(22) }) }),
]);

const response = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET() {
  try {
    const person = await identity();
    if (!person) return response({ error: 'Entre para continuar.' }, 401);
    const config = pushConfig();
    const id = (await cookies()).get(pushDeviceCookie)?.value;
    const [device] = id && deviceIdPattern.test(id)
      ? await db()<{ offers: boolean }[]>`select offers from push_subscriptions where id = ${id} and user_id = ${person.id}` : [];
    return response({ publicKey: config?.publicKey ?? null, registered: Boolean(device), offers: device?.offers ?? false });
  } catch {
    return response({ error: 'Não foi possível consultar as notificações.' }, 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !request.headers.get('content-type')?.startsWith('application/json')) {
    return response({ error: 'Solicitação inválida.' }, 403);
  }
  try {
    const person = await identity();
    if (!person) return response({ error: 'Entre para continuar.' }, 401);
    const input = command.parse(await request.json());
    const jar = await cookies();
    const previous = jar.get(pushDeviceCookie)?.value;
    if (input.action === 'disable') {
      if (previous) await removePushDevice(person.id, previous);
      jar.delete(pushDeviceCookie);
      return response({ ok: true });
    }
    if (input.action === 'offers') {
      if (!previous || !deviceIdPattern.test(previous)) return response({ error: 'Ative as notificações neste dispositivo primeiro.' }, 409);
      const result = await db()`update push_subscriptions set offers = ${input.enabled}
        where id = ${previous} and user_id = ${person.id}`;
      return result.count ? response({ ok: true }) : response({ error: 'Ative as notificações neste dispositivo primeiro.' }, 409);
    }
    if (!pushConfig()) return response({ error: 'As notificações estão indisponíveis neste ambiente.' }, 503);
    const next = randomUUID();
    await db().begin(async (sql) => {
      if (previous && deviceIdPattern.test(previous)) {
        await sql`delete from push_subscriptions where id = ${previous} and user_id = ${person.id}`;
      }
      await sql`insert into push_subscriptions (id, user_id, endpoint, p256dh, auth)
        values (${next}, ${person.id}, ${input.endpoint}, ${input.keys.p256dh}, ${input.keys.auth})
        on conflict (endpoint) do update set id = excluded.id, user_id = excluded.user_id,
          p256dh = excluded.p256dh, auth = excluded.auth, offers = false`;
    });
    jar.set(pushDeviceCookie, next, { ...sessionCookieOptions, maxAge: 365 * 86400, path: '/' });
    return response({ ok: true });
  } catch (failure) {
    if (failure instanceof z.ZodError || failure instanceof SyntaxError) return response({ error: 'Inscrição de notificações inválida.' }, 400);
    return response({ error: 'Não foi possível atualizar as notificações.' }, 503);
  }
}
