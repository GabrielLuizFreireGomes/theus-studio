import type { Database } from './db';
import { reminderAt } from './push-policy';
import type { Appointment } from './types';

export async function syncBookingNotifications(sql: Database, entry: Appointment, sendChange = false) {
  await sql`delete from notification_jobs where booking_id = ${entry.id}`;
  const startsAt = new Date(entry.starts_at);
  const reminder = entry.status === 'scheduled' ? reminderAt(startsAt) : null;
  if (reminder) {
    await sql`insert into notification_jobs (booking_id, kind, starts_at, due_at, run_at)
      values (${entry.id}, 'reminder', ${startsAt}, ${reminder}, ${reminder})`;
  }
  if (sendChange && startsAt > new Date()) {
    const kind = entry.status === 'cancelled' ? 'cancelled' : 'moved';
    await sql`insert into notification_jobs (booking_id, kind, starts_at, due_at, run_at)
      values (${entry.id}, ${kind}, ${startsAt}, now(), now())`;
  }
}
