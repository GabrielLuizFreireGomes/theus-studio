import type { Account } from './types';

export type Session = { email: string; admin: boolean; account: Account } | null;

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

async function read<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error ?? 'Tente novamente.', data.code);
  return data as T;
}

export async function get<T>(view: string, params: Record<string, string> = {}, signal?: AbortSignal) {
  return await read<T>(await fetch('/api/studio?' + new URLSearchParams({ view, ...params }), { signal }));
}

export async function post<T = { ok: true }>(command: Record<string, unknown>) {
  return await send<T>('/api/studio', command);
}

export async function send<T>(path: string, command: Record<string, unknown>) {
  return await read<T>(await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  }));
}

export function message(error: unknown) {
  return error instanceof ApiError ? error.message : 'A conexão falhou. Tente novamente.';
}
