import type { Metadata } from 'next';
import { Header } from '@/components/chrome';
import { MyAppointments } from '@/components/my-appointments';
import { requireIdentity } from '@/lib/auth';

export const metadata: Metadata = { title: 'Meus horários' };

export default async function Page() {
  await requireIdentity();
  return <><Header active="bookings" /><main className="shell page-body"><MyAppointments /></main></>;
}
