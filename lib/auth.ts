import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { hasPasswordSession, isStudioAdmin } from './auth-policy';

export function authConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Configure o Supabase Auth.');
  return { url, key };
}

export const sessionCookieOptions = { httpOnly: true, sameSite: 'lax' as const,
  secure: process.env.APP_ORIGIN?.startsWith('https:') ?? process.env.NODE_ENV === 'production' };

export async function auth() {
  const { url, key } = authConfig();
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (updates) => {
        try {
          for (const { name, value, options } of updates) jar.set(name, value, options);
        } catch {
          // Server Components receive refreshed cookies from the proxy.
        }
      },
    },
  }).auth;
}

export const identity = cache(async () => {
  const client = await auth();
  const { data } = await client.getClaims();
  if (!data?.claims.sub || !hasPasswordSession(data.claims.amr)) return null;
  const { data: { user } } = await client.getUser();
  if (!user?.email || !user.email_confirmed_at || user.id !== data.claims.sub) return null;
  const name = typeof user.user_metadata.name === 'string' ? user.user_metadata.name.trim().slice(0, 100) : '';
  return { id: user.id, email: user.email.toLowerCase(), admin: isStudioAdmin(user.id), name };
});

export async function requireIdentity(admin = false) {
  const person = await identity();
  if (!person) redirect(admin ? '/admin/entrar' : '/entrar');
  if (admin && !person.admin) redirect('/agendar');
  return person;
}

export type Identity = { id: string; email: string; admin: boolean; name?: string };
