import type { Appointment } from './types';

export type AgendaStatus = Appointment['status'] | 'blocked';
export const appointmentStatusOptions = [
  { value: 'scheduled', label: 'Agendados' },
  { value: 'completed', label: 'Concluídos' },
  { value: 'cancelled', label: 'Cancelados' },
];
export const historyStatusOptions = [{ value: '', label: 'Todos os status' }, ...appointmentStatusOptions];
type DayAvailability = 'busy' | 'blocked' | 'free' | 'closed';

export function classifyEntry(kind: Appointment['kind'], status: Appointment['status']): AgendaStatus {
  return status === 'scheduled' && kind === 'block' ? 'blocked' : status;
}

export function matchesAgendaFilter(status: AgendaStatus, filter: string, showBlocks = false) {
  if (status === 'blocked') return showBlocks;
  return filter === 'visible' ? status !== 'cancelled' : status === filter;
}

export function dayAvailability(open: boolean, states: AgendaStatus[]): DayAvailability {
  if (states.some((state) => state !== 'cancelled' && state !== 'blocked')) return 'busy';
  if (states.includes('blocked')) return 'blocked';
  return open ? 'free' : 'closed';
}

export function normalizeSearch(value: string) {
  return value.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
