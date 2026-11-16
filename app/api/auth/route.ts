import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appOrigin, sameOrigin } from '@/lib/app-origin';
import { auth } from '@/lib/auth';
import { isStudioAdmin } from '@/lib/auth-policy';
import { findCustomer, registerCustomer, transaction } from '@/lib/booking';
import { passwordError } from '@/lib/form-validation';

const email = z.email().max(254);
const password = z.string().superRefine((value, context) => {
  const error = passwordError(value);
  if (error) context.addIssue({ code: 'custom', message: error });
});
const token = z.string().min(32).max(256).regex(/^[a-zA-Z0-9_-]+$/);
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), email, password: z.string().min(1).max(256), admin: z.boolean().optional() }),
  z.object({ action: z.literal('signup'), email, password, name: z.string().trim().min(2).max(100) }),
  z.object({ action: z.literal('recover'), email, admin: z.boolean().optional() }),
  z.object({ action: z.literal('confirmEmail'), token }),
  z.object({ action: z.literal('reset'), token, password, admin: z.boolean().optional() }),
]);

function reply(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !request.headers.get('content-type')?.startsWith('application/json')) {
    return reply({ error: 'Solicitação inválida.' }, 403);
  }
  try {
    const input = action.parse(await request.json());
    const client = await auth();
    switch (input.action) {
      case 'login': {
        const { data, error } = await client.signInWithPassword({ email: input.email, password: input.password });
        if (error?.status === 429) return reply({ error: 'Muitas tentativas. Aguarde e tente novamente.' }, 429);
        if (error || !data.user.email_confirmed_at) {
          return reply({ error: 'Confira seu e-mail e senha. Contas novas precisam confirmar o e-mail.' }, 401);
        }
        if (input.admin && !isStudioAdmin(data.user.id)) {
          await client.signOut({ scope: 'local' });
          return reply({ error: 'Esta conta não tem acesso ao painel.' }, 403);
        }
        if (!input.admin) {
          const person = { id: data.user.id, email: input.email.toLowerCase(), admin: false };
          const metadataName = typeof data.user.user_metadata.name === 'string' ? data.user.user_metadata.name.trim().slice(0, 100) : '';
          await transaction(async (sql) => {
            const profile = await findCustomer(sql, person);
            const name = profile?.name ?? metadataName;
            if (name.length >= 2 && !profile?.auth_id) await registerCustomer(sql, person, name);
          });
        }
        return reply({ ok: true });
      }
      case 'signup': {
        const { error } = await client.signUp({ email: input.email, password: input.password, options: {
          data: { name: input.name },
          emailRedirectTo: appOrigin(request) + '/confirmar-email',
        } });
        if (error?.status === 429) return reply({ error: 'Aguarde antes de solicitar outro e-mail.' }, 429);
        if (error && error.code !== 'user_already_exists') return reply({ error: 'Confira os dados do cadastro e tente novamente.' }, 400);
        return reply({ ok: true });
      }
      case 'recover': {
        const path = input.admin ? '/admin/redefinir-senha' : '/redefinir-senha';
        const { error } = await client.resetPasswordForEmail(input.email, { redirectTo: appOrigin(request) + path });
        if (error?.status === 429) return reply({ error: 'Aguarde antes de solicitar outro e-mail.' }, 429);
        if (error && error.status && error.status >= 500) return reply({ error: 'O envio está indisponível. Tente novamente.' }, 503);
        return reply({ ok: true });
      }
      case 'confirmEmail': {
        const { error } = await client.verifyOtp({ token_hash: input.token, type: 'email' });
        if (error) return reply({ error: 'Este link expirou ou já foi usado. Tente entrar ou solicite outro acesso.' }, 400);
        await client.signOut({ scope: 'local' });
        return reply({ ok: true });
      }
      case 'reset': {
        const { error: invalid } = await client.verifyOtp({ token_hash: input.token, type: 'recovery' });
        if (invalid) return reply({ error: 'Este link expirou ou já foi usado. Solicite outro e-mail.' }, 400);
        const { error } = await client.updateUser({ password: input.password });
        if (error) {
          await client.signOut({ scope: 'local' });
          return reply({ error: 'Use uma senha diferente e solicite outro link para tentar novamente.' }, 400);
        }
        await client.signOut({ scope: 'global' });
        return reply({ ok: true });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues.find((item) => item.path[0] === 'password' && item.code === 'custom');
      return reply({ error: issue?.message ?? 'Confira os dados informados e tente novamente.' }, 400);
    }
    if (error instanceof SyntaxError) return reply({ error: 'Confira os dados informados e tente novamente.' }, 400);
    console.error('Studio auth request failed', error instanceof Error ? error.name : typeof error);
    return reply({ error: 'O acesso está indisponível. Tente novamente.' }, 503);
  }
}
