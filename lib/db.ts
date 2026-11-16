import postgres from 'postgres';

function connect(url: string) {
  return postgres(url, { max: 5, prepare: false, connect_timeout: 5, types: {
    calendarDate: { to: 1082, from: [1082], serialize: (value: string) => value, parse: (value: string) => value },
  } });
}

const singleton = globalThis as typeof globalThis & { studioDb?: ReturnType<typeof connect> };

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL para acessar o banco.');
  singleton.studioDb ??= connect(process.env.DATABASE_URL);
  return singleton.studioDb;
}

export type Database = ReturnType<typeof connect> | postgres.TransactionSql<{ calendarDate: string }>;
