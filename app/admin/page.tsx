import type { Metadata } from 'next';
import { Header } from '@/components/chrome';
import { Admin } from '@/components/admin';
import { requireIdentity } from '@/lib/auth';

export const metadata: Metadata = { title: 'Área do barbeiro', robots: { index: false, follow: false } };

export default async function Page() {
  await requireIdentity(true);
  return <><Header admin /><main className="shell page-body admin-page"><Admin /></main></>;
}
