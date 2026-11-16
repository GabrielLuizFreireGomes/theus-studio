'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarDays, CreditCard, TicketCheck } from 'lucide-react';
import { get, message, post, type Session } from '@/lib/client';
import { addDays, dayLabel, hourLabel, money, studioDay } from '@/lib/time';
import type { Appointment, Customer } from '@/lib/types';
import { Booking } from './booking';
import { ErrorText } from './chrome';
import { historyStatusOptions } from '@/lib/admin-agenda';
import { StyledSelect } from './styled-select';

const labels = { scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado' };

export function AppointmentCard({ entry, children }: { entry: Appointment; children?: React.ReactNode }) {
  return <article className="appointment">
    <div className="appointment-main">
      <span className="section-symbol"><CalendarDays size={19} aria-hidden /></span>
      <div><h3>{entry.title}</h3><p>{dayLabel(studioDay(new Date(entry.starts_at)))} às {hourLabel(entry.starts_at)}</p></div>
      <span className={'status ' + entry.status}>{labels[entry.status]}</span>
    </div>
    {entry.total !== null && <p className="appointment-price">{entry.covered ? 'Incluído na assinatura' : money(entry.total)}</p>}
    {children && <div className="appointment-actions">{children}</div>}
  </article>;
}

export function PlanStatus({ customer }: { customer: Customer | null }) {
  const active = activePlan(customer);
  return <><span className={active ? 'status completed' : 'status'}>
    {active ? 'Ativa' : customer?.plan_end ? 'Encerrada' : 'Sem assinatura'}</span>
    {customer?.plan_end && <p>{active ? 'Válida até' : 'Último dia de validade'} {dayLabel(addDays(customer.plan_end, -1), 'dd LLL yyyy')}.</p>}</>;
}

export function activePlan(customer: Customer | null) {
  const today = studioDay();
  return Boolean(customer?.plan_start && customer.plan_start <= today && customer.plan_end && today < customer.plan_end);
}

export function MyAppointments() {
  const [session, setSession] = useState<Session | undefined>();
  const [error, setError] = useState('');
  const [moving, setMoving] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');

  async function load() {
    setSession(await get<Session>('session'));
  }

  useEffect(() => {
    const controller = new AbortController();
    get<Session>('session', {}, controller.signal).then(setSession).catch((failure) => {
      if (!controller.signal.aborted) setError(message(failure));
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!session || moving) return;
    const target = window.location.hash.slice(1);
    if (target !== 'assinatura' && target !== 'fidelidade') return;
    const frame = window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [session, moving]);

  async function run(task: () => Promise<void>) {
    setError('');
    setNotice('');
    setBusy(true);
    try { await task(); } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-heading">
      <div><h1>Meus horários</h1></div>
    </div>
    <ErrorText>{error}</ErrorText>
    {notice && <p role="status" className="inline-notice">{notice}</p>}
    {session === undefined ? (error ? <button className="button" onClick={() => void run(load)}>Tentar novamente</button> : <p role="status">Carregando…</p>)
      : !session ? <Link className="button primary" href="/entrar">Entrar</Link>
      : moving ? <div className="detail-panel">
        <button className="text-button" type="button" onClick={() => setMoving(null)}>Fechar remarcação</button>
        <Booking key={moving.id} appointment={moving} services={[]} backLabel="Voltar aos meus horários" onDone={() => {
          setMoving(null);
          void run(load);
        }} />
      </div> : <div className="account-layout">
        <div>
          <div className="list-heading"><h2>Próximos</h2><Link href="/agendar" className="text-button">Agendar horário <ArrowRight size={18} aria-hidden /></Link></div>
          {(() => {
            const account = session.account;
            const upcoming = account.bookings.filter((entry) => entry.status === 'scheduled' && +new Date(entry.starts_at) > Date.now()).reverse();
            const prior = account.bookings.filter((entry) => !upcoming.includes(entry));
            const history = prior.filter((entry) => !historyStatus || entry.status === historyStatus);
            return <>
              {upcoming.length === 0 && <p className="empty">Você ainda não tem horários futuros.</p>}
              {upcoming.map((entry) => <AppointmentCard key={entry.id} entry={entry}>
                {cancelling === entry.id ? <>
                  <span>Cancelar este horário?</span>
                  <button className="text-button danger" type="button" disabled={busy} onClick={() => void run(async () => {
                    await post({ action: 'cancel', id: entry.id }); setCancelling(null); await load(); setNotice('Horário cancelado.');
                  })}>Confirmar cancelamento</button>
                  <button className="text-button" type="button" onClick={() => setCancelling(null)}>Manter horário</button>
                </> : <>
                  <button className="text-button" type="button" onClick={() => setMoving(entry)}>Remarcar</button>
                  <button className="text-button danger" type="button" onClick={() => setCancelling(entry.id)}>Cancelar</button>
                </>}
              </AppointmentCard>)}
              <div className="list-heading history-heading"><h2>Histórico</h2>
                {!!prior.length && <div className="compact-filter"><StyledSelect label="Status do histórico"
                  value={historyStatus} onChange={setHistoryStatus} options={historyStatusOptions} /></div>}
              </div>
              {history.length ? history.map((entry) => <AppointmentCard key={entry.id} entry={entry} />)
                : <p className="empty">{prior.length ? 'Nenhum atendimento com esse status.' : 'Seu histórico aparecerá aqui.'}</p>}
            </>;
          })()}
        </div>
        <aside className="stack">
          {session.account.goal && <section id="fidelidade" className="benefit-card"><span className="section-symbol"><TicketCheck size={20} aria-hidden /></span>
            <h2>Fidelidade</h2>
            <>
              <p>{session.account.customer?.progress ?? 0} de {session.account.goal} cortes</p>
              <progress max={session.account.goal} value={session.account.customer?.progress ?? 0} aria-label="Progresso da fidelidade" />
              <p className="muted">Faltam {session.account.goal - (session.account.customer?.progress ?? 0)} para {session.account.goal === 5 ? 'ganhar 50% de desconto' : 'ganhar um corte grátis'}.</p>
            </>
            {session.account.rewards.length > 0 && <p className="inline-notice">
              {session.account.rewards.length} {session.account.rewards.length === 1 ? 'benefício disponível' : 'benefícios disponíveis'}. Escolha no resumo do próximo corte avulso.</p>}
          </section>}
          {(session.account.plan.plan_enabled || activePlan(session.account.customer)) &&
          <section id="assinatura" className="benefit-card"><span className="section-symbol"><CreditCard size={20} aria-hidden /></span>
            <h2>{session.account.plan.plan_name}</h2>
            <p>{activePlan(session.account.customer) ? 'Cortes ilimitados com horário marcado.' : session.account.plan.plan_description}</p>
            <p className="plan-price">{activePlan(session.account.customer) && session.account.customer?.plan_paid_amount
              ? 'Último pagamento: ' + money(session.account.customer.plan_paid_amount)
              : money(session.account.plan.plan_price) + ' por mês'}</p>
            <PlanStatus customer={session.account.customer} />
            {!activePlan(session.account.customer) && (session.account.customer?.plan_requested_at
              ? <p className="inline-notice">Solicitação enviada ao barbeiro.</p>
              : <button className="button primary subscription-cta" type="button" disabled={busy} onClick={() => void run(async () => {
                await post({ action: 'requestSubscription' }); await load(); setNotice('Solicitação enviada.');
              })}>Solicitar ativação <ArrowRight size={17} aria-hidden /></button>)}
          </section>}
        </aside>
      </div>}
  </>;
}
