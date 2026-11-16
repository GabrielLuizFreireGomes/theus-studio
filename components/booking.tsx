'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Scissors } from 'lucide-react';
import { ApiError, get, message, post } from '@/lib/client';
import { addDays, dayLabel, hourLabel, money, studioDay } from '@/lib/time';
import type { Appointment, Customer, Quote, Service } from '@/lib/types';
import { ErrorText } from './chrome';
import { StyledSelect } from './styled-select';

export function Booking({ services, appointment, manual = false, customers = [], onDone,
  backLabel = 'Voltar à agenda', needsName = false }: {
  services: Service[];
  appointment?: Appointment;
  manual?: boolean;
  customers?: Customer[];
  onDone?: () => void;
  backLabel?: string;
  needsName?: boolean;
}) {
  const today = studioDay();
  const currentDay = appointment ? studioDay(new Date(appointment.starts_at)) : today;
  const [serviceId, setServiceId] = useState(appointment?.service_id ?? '');
  const [day, setDay] = useState(currentDay);
  const [dayOffset, setDayOffset] = useState(() => Math.max(0,
    Array.from({ length: 30 }, (_, index) => addDays(today, index)).indexOf(currentDay) - 2));
  const [startsAt, setStartsAt] = useState('');
  const [slots, setSlots] = useState<string[] | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [slotsError, setSlotsError] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Appointment | null>(null);
  const requestId = useRef('');
  const heading = useRef<HTMLHeadingElement>(null);
  const service = services.find((item) => item.id === serviceId);
  const title = appointment?.title ?? service?.name;
  const duration = appointment
    ? (+new Date(appointment.ends_at) - +new Date(appointment.starts_at)) / 60000
    : service?.duration;
  const manualContact = manual && !appointment;
  const manualInfo = manualContact ? { email: customerEmail.trim(), name: customerName.trim() } : undefined;

  useEffect(() => {
    if (!serviceId) return;
    const abort = new AbortController();
    const params: Record<string, string> = { day, service: serviceId };
    if (appointment) params.appointment = appointment.id;
    get<string[]>('slots', params, abort.signal).then((items) => {
      if (!abort.signal.aborted) setSlots(items);
    }).catch((failure) => {
      if (!abort.signal.aborted) setSlotsError(message(failure));
    });
    return () => abort.abort();
  }, [appointment, day, refresh, serviceId]);

  function resetSlots() {
    setStartsAt('');
    setSlots(null);
    setSlotsError('');
    setQuote(null);
    setError('');
    requestId.current = '';
  }

  function chooseDay(value: string) {
    if (value === day) return;
    resetSlots();
    setDay(value);
  }

  function changeContact(name: string, email: string) {
    setCustomerName(name);
    setCustomerEmail(email);
    setQuote(null);
    setError('');
    requestId.current = '';
  }

  async function getQuote(time: string, rewardId?: string | null) {
    const next = await post<Quote>({ action: 'quote', serviceId, startsAt: time, appointmentId: appointment?.id,
      email: manualInfo?.email, rewardId });
    setQuote(next);
  }

  async function run(task: () => Promise<void>) {
    setError('');
    setBusy(true);
    try { await task(); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  function chooseSlot(time: string) {
    setStartsAt(time);
    setQuote(null);
    setError('');
    requestId.current = '';
    if (!manualContact) void run(() => getQuote(time));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!startsAt || busy) return;
    await run(async () => {
      if (!quote) {
        await getQuote(startsAt);
        return;
      }
      if (needsName) await post({ action: 'profile', name: customerName.trim() });
      requestId.current ||= crypto.randomUUID();
      try {
        const booking = await post<Appointment>({ action: 'confirm', serviceId, startsAt, appointmentId: appointment?.id,
          rewardId: quote.rewardId, total: quote.total, covered: quote.covered,
          requestId: requestId.current, manual: manualInfo });
        setDone(booking);
        requestAnimationFrame(() => heading.current?.focus());
      } catch (failure) {
        if (failure instanceof ApiError && failure.code === 'slot_unavailable') {
          resetSlots();
          setRefresh((value) => value + 1);
        } else if (failure instanceof ApiError && failure.code === 'price_changed') {
          setQuote(null);
          await getQuote(startsAt);
        }
        throw failure;
      }
    });
  }

  if (done) return <div className="booking-panel success-panel">
    <span className="success-mark"><Check aria-hidden /></span>
    <h2 ref={heading} tabIndex={-1}>{appointment ? 'Horário remarcado' : 'Horário confirmado'}</h2>
    <p>{done.title} · {dayLabel(studioDay(new Date(done.starts_at)))} às {hourLabel(done.starts_at)}</p>
    <strong>{money(done.total ?? 0)}</strong>
    {onDone ? <button className="button primary" type="button" onClick={onDone}>{backLabel}<ArrowRight size={17} aria-hidden /></button>
      : <Link className="button primary" href="/meus-horarios">Ver meus horários<ArrowRight size={17} aria-hidden /></Link>}
  </div>;

  return <div className="booking-workspace">
    <div className="booking-controls">
      {!appointment && <section className="booking-panel" aria-labelledby="service-title">
        <div className="panel-title"><Scissors size={18} aria-hidden /><h2 id="service-title">Serviço</h2></div>
        <div className="service-list">
          {services.filter((item) => item.active).map((item) => <button key={item.id} type="button" className="service-row"
            aria-pressed={item.id === serviceId} disabled={busy}
            onClick={() => { if (serviceId !== item.id) { resetSlots(); setServiceId(item.id); } }}>
            <span className="option-dot" aria-hidden />
            <span className="service-name"><strong>{item.name}</strong><small>{item.duration} min</small></span>
            <strong className="service-price">{money(item.price)}</strong>
          </button>)}
          {!services.some((item) => item.active) && <p className="empty">Nenhum serviço disponível para agendar.</p>}
        </div>
      </section>}
      <section className="booking-panel" aria-labelledby="schedule-title">
        <div className="panel-title"><CalendarDays size={18} aria-hidden /><h2 id="schedule-title">Data e horário</h2></div>
        <fieldset className="slot-fieldset" disabled={busy || !serviceId}>
          <legend className="sr-only">Escolha a data e o horário</legend>
          <div className="date-navigation">
            <button className="icon-button" type="button" aria-label="Datas anteriores" disabled={dayOffset === 0}
              onClick={() => { const start = Math.max(0, dayOffset - 5); setDayOffset(start); chooseDay(addDays(today, start)); }}><ChevronLeft size={18} /></button>
            <div className="date-strip" aria-label="Datas" role="group">
              {Array.from({ length: Math.min(5, 30 - dayOffset) }, (_, index) => addDays(today, dayOffset + index)).map((value) =>
                <button key={value} type="button" aria-pressed={value === day} aria-label={dayLabel(value, 'cccc, dd LLLL')}
                  onClick={() => chooseDay(value)}><span>{value === today ? 'Hoje' : dayLabel(value, 'ccc')}</span>
                  <strong>{value.slice(-2)}</strong><small>{dayLabel(value, 'LLL')}</small></button>)}
            </div>
            <button className="icon-button" type="button" aria-label="Próximas datas" disabled={dayOffset >= 25}
              onClick={() => { const start = Math.min(25, dayOffset + 5); setDayOffset(start); chooseDay(addDays(today, start)); }}><ChevronRight size={18} /></button>
          </div>
          {!serviceId ? <p className="empty slot-message">Selecione um serviço para ver os horários.</p>
            : slotsError ? <><ErrorText>{slotsError}</ErrorText><button type="button" className="text-button" onClick={() => {
              setSlotsError(''); setRefresh((value) => value + 1);
            }}>Tentar novamente</button></>
            : slots === null ? <p className="empty slot-message" role="status">Buscando horários…</p>
            : slots.length ? <div className="time-grid" role="group" aria-label="Horários disponíveis">{slots.map((value) =>
              <button key={value} type="button" aria-pressed={startsAt === value} onClick={() => chooseSlot(value)}>{hourLabel(value)}</button>)}</div>
            : <p className="empty slot-message">Sem horários livres. Escolha outra data.</p>}
        </fieldset>
      </section>
    </div>
    <aside className="booking-panel booking-summary" aria-labelledby="summary-title">
      <h2 id="summary-title">Resumo da reserva</h2>
      <dl className="summary-details">
        <div><dt>Serviço</dt><dd>{title ?? 'A selecionar'}{duration ? <small>{duration} min</small> : null}</dd></div>
        <div><dt>Data e horário</dt><dd>{startsAt ? `${dayLabel(day)} às ${hourLabel(startsAt)}` : 'A selecionar'}</dd></div>
      </dl>
      <form className="stack summary-form" onSubmit={submit}>
        {manualContact && <div className="select-field"><span>Cliente</span><StyledSelect label="Cliente" defaultValue="" disabled={busy} onChange={(value) => {
          const selected = customers.find((item) => item.id === value);
          changeContact(selected?.name ?? '', selected?.email ?? '');
        }} options={[{ value: '', label: 'Novo cliente' }, ...customers.map((item) => ({ value: item.id, label: item.name + ' · ' + item.email }))]} /></div>}
        {(manualContact || needsName) && <label>Nome<input autoComplete="name" value={customerName}
          required minLength={2} maxLength={100} disabled={busy} onChange={(event) => {
            if (manualContact) changeContact(event.target.value, customerEmail);
            else setCustomerName(event.target.value);
          }} /></label>}
        {manualContact && <label>E-mail<input type="email" value={customerEmail} required maxLength={254}
          disabled={busy} onChange={(event) => changeContact(customerName, event.target.value)} /></label>}
        {!!quote?.rewards.length && <div className="select-field"><span>Benefício de fidelidade</span>
          <StyledSelect label="Benefício de fidelidade" disabled={busy} value={quote.rewardId ?? ''}
            onChange={(value) => void run(() => getQuote(startsAt, value || null))}
            options={[{ value: '', label: 'Guardar para outro corte' }, ...quote.rewards.map((reward, index) => ({
              value: reward.id, label: (reward.percent === 100 ? 'Corte grátis' : '50% de desconto') +
                (quote.rewards.length > 1 ? ` (${index + 1})` : ''),
            }))]} />
        </div>}
        {quote?.covered && <p className="inline-notice"><Check size={17} aria-hidden /> Incluído na assinatura</p>}
        {quote?.promotion && <p className="inline-notice"><Check size={17} aria-hidden /> {quote.promotion.title}: {quote.promotion.percent}% de desconto</p>}
        <ErrorText>{error}</ErrorText>
        <div className={'summary-action' + (quote ? ' ready' : '')}>
          <div className="total"><span>{quote ? 'Total' : 'Preço do serviço'}</span>
            <strong>{quote ? money(quote.total) : title ? money(appointment?.price ?? service?.price ?? 0) : '—'}</strong></div>
          <button className="button primary" disabled={!startsAt || busy || (!quote && !manualContact && !error)}>
            {busy ? 'Aguarde…' : !quote && startsAt ? 'Revisar reserva' : appointment ? 'Confirmar remarcação' : 'Confirmar horário'}
            <ArrowRight size={17} aria-hidden /></button>
        </div>
      </form>
    </aside>
  </div>;
}
