import { redirect } from 'next/navigation';
import { AuthScreen } from '@/components/auth-screen';
import { identity } from '@/lib/auth';

export default async function Page({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  if ((await identity())?.admin) redirect('/admin');
  return <AuthScreen mode="login" admin notice={(await searchParams).senha ? 'Senha atualizada.' : undefined} />;
}
