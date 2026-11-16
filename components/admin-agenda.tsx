'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, Search } from 'lucide-react';
import { appointmentStatusOptions, classifyEntry, dayAvailability, matchesAgendaFilter, normalizeSearch, type AgendaStatus } from '@/lib/admin-agenda';
import { addDays, dayAt, dayLabel, hourLabel, money, studioDay, weekday } from '@/lib/time';
import type { Appointment, Hours } from '@/lib/types';
import { ActionDialog } from './action-dialog';
import type { Execute } from './admin-settings';
import { StyledSelect } from './styled-select';

const statusLabels = { scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado', blocked: 'Bloqueio' };
const statusOptions = [
  { value: 'visible', label: 'Agendados e concluídos' },
  ...appointmentStatusOptions,
];
const availabilityLabels = { free: 'Livre', closed: 'Fechado', blocked: 'Com bloqueio', busy: 'Com atendimentos' };
const commands = {
  cancel: { title: 'Cancelar atendimento?', label: 'Cancelar atendimento', done: 'Horário cancelado.', danger: true },
  complete: { title: 'Concluir atendimento?', label: 'Concluir atendimento', done: 'Atendimento concluído.', danger: false },
  unblock: { title: 'Remover bloqueio?', label: 'Remover bloqueio', done: 'Bloqueio removido.', danger: true },
};

export type AgendaData = { entries: Appointment[]; next: Appointment | null };

export function AdminAgenda({ data, week, date, days, hours, busy, execute, move, navigate }: {
  data: AgendaData | null; week: string; date: string; days: 1 | 7; hours: Hours[]; busy: boolean; execute: Execute;
  move: (entry: Appointment) => void; navigate: (day: string, days?: 1 | 7) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('visible');
  const [onlyFree, setOnlyFree] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [pending, setPending] = useState<{ entry: Appointment; action: keyof typeof commands } | null>(null);
  const today = studioDay();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const normalized = normalizeSearch(query);
  const schedule = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(week, index);
    const end = +dayAt(addDays(day, 1));
    const start = +dayAt(day);
    const entries = (data?.entries ?? []).filter((entry) => +new Date(entry.starts_at) < end && +new Date(entry.ends_at) > start)
      .map((entry) => ({ entry, status: classifyEntry(entry.kind, entry.status) }));
    const availability = dayAvailability(hours.some((item) => item.weekday === weekday(day)), entries.map((item) => item.status));
    return { day, entries, availability };
  });
  const visible = schedule.filter((item) => (days === 7 || item.day === date) &&
    (!onlyFree || item.availability === 'free'));
  const showEntry = (entry: Appointment, status: AgendaStatus) => !onlyFree && matchesAgendaFilter(status, filter, showBlocks) &&
    normalizeSearch((entry.customer_name ?? '') + ' ' + entry.title).includes(normalized);

  return <>
    {data?.next && +new Date(data.next.starts_at) > now && <aside className="next-booking">
      <span className="section-symbol"><Clock3 size={21} aria-hidden /></span>
      <div><p>Próximo atendimento</p><h3>{data.next.customer_name} · {data.next.title}</h3></div>
      <button className="text-button" type="button" onClick={() => {
        setFilter('visible'); setOnlyFree(false); setQuery(''); navigate(studioDay(new Date(data.next!.starts_at)), 1);
      }}>{dayLabel(studioDay(new Date(data.next.starts_at)))} às {hourLabel(data.next.starts_at)}<ChevronRight size={16} aria-hidden /></button>
    </aside>}
    <div className="calendar-toolbar">
      <div className="agenda-controls">
        <div className="inline-actions calendar-arrows">
          <button className="icon-button" aria-label="Semana anterior" type="button" onClick={() => navigate(addDays(date, -7))}><ChevronLeft size={19} /></button>
          <label className="calendar-range"><CalendarDays size={16} aria-hidden />
            {dayLabel(week, 'dd LLL')} a {dayLabel(addDays(week, 6), 'dd LLL yyyy')}
            <input type="date" lang="pt-BR" aria-label="Ir para uma data" value={date} onChange={(event) => { if (event.target.value) navigate(event.target.value); }} />
          </label>
          <button className="icon-button" aria-label="Próxima semana" type="button" onClick={() => navigate(addDays(date, 7))}><ChevronRight size={19} /></button>
          <button className="text-button" type="button" onClick={() => navigate(today)}>Hoje</button>
        </div>
        <div className="segmented" role="group" aria-label="Visualização">
          <button type="button" aria-pressed={days === 1} onClick={() => { setOnlyFree(false); navigate(date, 1); }}>Dia</button>
          <button type="button" aria-pressed={days === 7} onClick={() => navigate(date, 7)}>Semana</button>
        </div>
      </div>
      {days === 1 && data && <div className="calendar-strip" role="group" aria-label="Escolher dia">
        {schedule.map(({ day, availability }) => <button type="button" key={day} aria-pressed={day === date}
          className={'day-tile ' + availability} aria-label={dayLabel(day, 'cccc, dd LLLL') + ', ' + availabilityLabels[availability]}
          onClick={() => navigate(day, 1)}>
          <small>{day === today ? 'Hoje' : dayLabel(day, 'ccc')}</small><strong>{day.slice(-2)}</strong>
          <span>{availability === 'busy' ? 'Ocupado' : availability === 'blocked' ? 'Bloqueio' : availabilityLabels[availability]}</span>
        </button>)}
      </div>}
      <div className="filter-bar">
        <label className="filter-search"><span>Buscar na agenda</span><div><Search size={17} aria-hidden /><input type="search"
          value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente ou serviço" /></div></label>
        <div className="select-field"><span>Status do atendimento</span>
          <StyledSelect label="Status do atendimento" value={filter} options={statusOptions}
            onChange={(value) => { setFilter(value); setOnlyFree(false); }} />
        </div>
        <div className="agenda-quick-filters" role="group" aria-label="Filtros da semana">
          <button className="button" type="button" aria-pressed={onlyFree} onClick={() => {
            setOnlyFree(!onlyFree);
            if (!onlyFree) { setQuery(''); setShowBlocks(false); navigate(date, 7); }
          }}>Dias livres</button>
          <button className="button" type="button" aria-pressed={showBlocks} onClick={() => {
            setShowBlocks(!showBlocks); setOnlyFree(false);
          }}>Ver bloqueios</button>
        </div>
      </div>
    </div>
    {!data ? <p role="status" className="empty">Carregando agenda…</p> : <div className={days === 7 ? 'agenda-week' : 'agenda-day'}>
      {!visible.length && <p className="empty">Nenhum dia livre nesta semana.</p>}
      {visible.map(({ day, entries, availability }) => {
        const matching = entries.filter(({ entry, status }) => showEntry(entry, status));
        const booked = entries.filter(({ status }) => status === 'scheduled').length;
        const cancelled = filter === 'cancelled' ? matching.filter(({ status }) => status === 'cancelled').length : 0;
        return <section className={'agenda-column ' + availability} key={day}>
          <div className="agenda-column-heading">
            {days === 7 ? <button type="button" className="text-button day-heading" onClick={() => { setOnlyFree(false); navigate(day, 1); }}>
              <span>{dayLabel(day, 'ccc')}</span><strong>{day.slice(-2)}</strong></button>
              : <h3>{dayLabel(day, 'cccc, dd LLLL')}</h3>}
            <span className={'day-state ' + availability}>{availabilityLabels[availability]}</span>
            {(booked > 0 || cancelled > 0) && <small className="day-count">{[booked ? booked + ' na agenda' : '', cancelled ? cancelled + (cancelled === 1 ? ' cancelado' : ' cancelados') : ''].filter(Boolean).join(' · ')}</small>}
          </div>
          {!matching.length && <p className="empty calendar-empty">{onlyFree ? 'Sem reservas ou bloqueios' : filter !== 'visible' || normalized
            ? 'Sem resultados' : availability === 'closed' ? 'Fora do expediente' : 'Sem horários marcados'}</p>}
          {matching.map(({ entry, status }) => {
            const id = day + entry.id;
            const open = expanded === id;
            return <article className={'schedule-entry agenda-card ' + status} key={id}>
              <button className="schedule-entry-toggle" type="button" aria-expanded={open} onClick={() => setExpanded(open ? '' : id)}>
                <span className="agenda-card-top"><time>{studioDay(new Date(entry.starts_at)) === day ? hourLabel(entry.starts_at) : '00:00'}</time>
                  <span className={'agenda-status ' + status}>{statusLabels[status]}</span><ChevronDown size={14} aria-hidden /></span>
                <span><strong title={entry.kind === 'block' ? entry.title : entry.customer_name ?? undefined}>{entry.kind === 'block' ? entry.title : entry.customer_name}</strong>
                  {entry.kind === 'booking' && <small>{entry.title}</small>}</span>
              </button>
              {open && <div className="schedule-detail">
                {days === 7 && entry.kind === 'booking' && <p className="schedule-full-name">{entry.customer_name}</p>}
                <p>{entry.kind === 'block' ? 'Até ' + dayLabel(studioDay(new Date(entry.ends_at))) + ' às ' + hourLabel(entry.ends_at)
                  : entry.covered ? 'Incluído na assinatura' : money(entry.total ?? 0)}</p>
                {entry.status === 'scheduled' && <div className="inline-actions">
                  {status === 'blocked' ? <button type="button" className="text-button danger" disabled={busy} onClick={() => setPending({ entry, action: 'unblock' })}>Remover bloqueio</button>
                    : <>
                      {+new Date(entry.starts_at) > now ? <button type="button" className="text-button" onClick={() => move(entry)}>Remarcar</button>
                        : <button type="button" className="text-button" disabled={busy} onClick={() => setPending({ entry, action: 'complete' })}>Concluir</button>}
                      <button type="button" className="text-button danger" disabled={busy} onClick={() => setPending({ entry, action: 'cancel' })}>Cancelar</button>
                    </>}
                </div>}
              </div>}
            </article>;
          })}
        </section>;
      })}
    </div>}
    {pending && <ActionDialog title={commands[pending.action].title} label={commands[pending.action].label}
      danger={commands[pending.action].danger} close={() => setPending(null)}
      submit={(_, report) => execute({ action: pending.action, id: pending.entry.id }, commands[pending.action].done, report)}>
      <p className="muted">{[pending.entry.customer_name, pending.entry.title,
        dayLabel(studioDay(new Date(pending.entry.starts_at))) + ' às ' + hourLabel(pending.entry.starts_at)].filter(Boolean).join(' · ')}</p>
    </ActionDialog>}
  </>;
}
