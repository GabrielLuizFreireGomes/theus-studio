import { AccountSettings } from '@/components/account-settings';
import { Header } from '@/components/chrome';
import { requireIdentity } from '@/lib/auth';

export const metadata = { title: 'Conta' };

export default async function Page() {
  const user = await requireIdentity();
  return <><Header active="account" /><main className="shell page-body">
    <div className="page-heading"><h1>Conta</h1></div>
    <AccountSettings email={user.email} />
  </main></>;
}
