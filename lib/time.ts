import { DateTime } from 'luxon';

export const zone = 'America/Sao_Paulo';
const dateLocale = { zone, locale: 'pt-BR' };

export function studioDay(date = new Date()) {
  return DateTime.fromJSDate(date, dateLocale).toISODate()!;
}

export function validDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && DateTime.fromISO(day, dateLocale).isValid;
}

export function dayAt(day: string, minute = 0) {
  return DateTime.fromISO(day, dateLocale).startOf('day').plus({ minutes: minute }).toJSDate();
}

export function addDays(day: string, days: number) {
  return DateTime.fromISO(day, dateLocale).plus({ days }).toISODate()!;
}

export function addMonth(day: string) {
  return DateTime.fromISO(day, dateLocale).plus({ months: 1 }).toISODate()!;
}

export function weekday(day: string) {
  return DateTime.fromISO(day, dateLocale).weekday;
}

export function minutesAt(value: string | Date) {
  const local = DateTime.fromJSDate(new Date(value), dateLocale);
  return local.hour * 60 + local.minute;
}

export function overlaps(start: number, end: number, otherStart: number, otherEnd: number) {
  return start < otherEnd && end > otherStart;
}

export function dayLabel(day: string, format = 'ccc, dd LLL') {
  return DateTime.fromISO(day, dateLocale).toFormat(format).replaceAll('.', '');
}

export function hourLabel(value: string | Date) {
  return DateTime.fromJSDate(new Date(value), dateLocale).toFormat('HH:mm');
}

export function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
