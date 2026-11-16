import { existsSync, readFileSync } from 'node:fs';
import postgres from 'postgres';

async function seed() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Use apenas um banco local para a demonstração.');
  }
  const sql = postgres(url.toString());
  try {
    await sql.unsafe(readFileSync('supabase/demo.sql', 'utf8'));
    console.log('Dados de demonstração disponíveis.');
  } finally {
    await sql.end();
  }
}

seed().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
