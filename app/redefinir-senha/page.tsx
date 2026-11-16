import { AuthScreen } from '@/components/auth-screen';

export default async function Page({ searchParams }: { searchParams: Promise<{ token_hash?: string }> }) {
  return <AuthScreen mode="reset" token={(await searchParams).token_hash} />;
}
