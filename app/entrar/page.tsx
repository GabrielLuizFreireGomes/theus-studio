import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/auth-screen';
import { identity } from '@/lib/auth';

export default async function Page({ searchParams }: { searchParams: Promise<{ confirmado?: string; senha?: string }> }) {
  if (await identity()) redirect('/agendar');
  const query = await searchParams;
  return <AuthScreen mode="login" notice={query.confirmado ? 'E-mail confirmado. Entre com sua senha.' : query.senha ? 'Senha atualizada.' : undefined} />;
}
