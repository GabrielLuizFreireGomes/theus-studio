'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Megaphone, Pencil, Plus, Scissors, Search, Settings2, TicketCheck, Users } from 'lucide-react';
import { get, message, post, type Session } from '@/lib/client';
import { addDays, dayLabel, money, studioDay, weekday } from '@/lib/time';
import { historyStatusOptions, normalizeSearch } from '@/lib/admin-agenda';
import { StyledSelect } from './styled-select';
import type { Appointment, Campaign, Customer, Hours, Payment, Plan, Reward, Service } from '@/lib/types';
import { Booking } from './booking';
import { ErrorText } from './chrome';
import { activePlan, AppointmentCard, PlanStatus } from './my-appointments';
import { HoursSettings, LoyaltySettings, ServiceSettings, type Execute } from './admin-settings';
import { ActionDialog } from './action-dialog';
import { AdminAgenda, type AgendaData } from './admin-agenda';
import { AdminOffers } from './admin-offers';

type AdminData = { services: Service[]; hours: Hours[]; customers: Customer[]; goal: 5 | 10 | null; plan: Plan; campaigns: Campaign[] };
type Detail = { bookings: Appointment[]; payments: Payment[]; rewards: (Reward & { booking_id: string | null; used_at: string | null })[] };

const tabs = [
  { name: 'Agenda', icon: CalendarDays },
  { name: 'Serviços', icon: Scissors },
  { name: 'Expediente', icon: Settings2 },
  { name: 'Clientes', icon: Users },
  { name: 'Fidelidade', icon: TicketCheck },
  { name: 'Ofertas', icon: Megaphone },
] as const;

export function Admin() {
  const [session, setSession] = useState<Session | undefined>();
  const [data, setData] = useState<AdminData | null>(null);
  const [agenda, setAgenda] = useState<AgendaData | null>(null);
  const [tab, setTab] = useState<typeof tabs[number]['name']>('Agenda');
  const [selectedDay, setSelectedDay] = useState(() => studioDay());
  const [days, setDays] = useState<1 | 7>(1);
  const agendaDay = addDays(selectedDay, 1 - weekday(selectedDay));
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Appointment | 'new' | null>(null);

  async function loadSession() {
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
    if (!session?.admin) return;
    const controller = new AbortController();
    get<AdminData>('admin', {}, controller.signal).then(setData).catch((failure) => {
      if (!controller.signal.aborted) setError(message(failure));
    });
    return () => controller.abort();
  }, [session, tab, version]);

  useEffect(() => {
    if (!session?.admin || tab !== 'Agenda') return;
    const controller = new AbortController();
    get<AgendaData>('agenda', { day: agendaDay, days: '7' }, controller.signal).then((result) => {
      if (!controller.signal.aborted) setAgenda(result);
    })
      .catch((failure) => { if (!controller.signal.aborted) setError(message(failure)); });
    return () => controller.abort();
  }, [session, tab, agendaDay, version]);

  const execute: Execute = async (command, success, reportError = setError) => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await post(command);
      setNotice(success);
      setVersion((previous) => previous + 1);
      return true;
    } catch (failure) {
      reportError(message(failure));
      return false;
    } finally { setBusy(false); }
  };

  async function logOut() {
    if (await execute({ action: 'logout' }, '')) {
      window.location.replace('/admin/entrar');
    }
  }

  function showDay(day: string, count = days) {
    if (addDays(day, 1 - weekday(day)) !== agendaDay) setAgenda(null);
    setSelectedDay(day);
    setDays(count);
  }

  return <>
    <div className="page-heading">
      <div><h1>{session?.admin ? 'Painel do barbeiro' : 'Área do barbeiro'}</h1>
        <p className="muted">{session?.admin ? 'Agenda e atendimentos da Theus Studio.' : 'Entre com o e-mail autorizado.'}</p></div>
      {session && <button className="text-button" type="button" disabled={busy} onClick={() => void logOut()}>Sair</button>}
    </div>
    <ErrorText>{error}</ErrorText>
    {notice && <p role="status" className="inline-notice">{notice}</p>}
    {session === undefined ? error
      ? <button className="button" onClick={() => void loadSession().then(() => setError('')).catch((failure) => setError(message(failure)))}>Tentar novamente</button>
      : <p role="status">Carregando…</p>
      : !session ? <a className="button primary" href="/admin/entrar">Entrar no painel</a>
      : !session.admin ? <p className="empty">Este e-mail tem acesso apenas à área do cliente.</p>
      : <div className="admin-layout">
        <nav className="admin-nav" aria-label="Painel">
          {tabs.map(({ name, icon: Icon }) => <button key={name} type="button" aria-current={name === tab ? 'page' : undefined}
            onClick={() => { setTab(name); setEditing(null); setError(''); setNotice(''); }}>
            <Icon size={18} aria-hidden />{name}</button>)}
        </nav>
        <div className="admin-content">
          {!data ? error ? <button className="button" type="button" onClick={() => { setError(''); setVersion(version + 1); }}>Tentar novamente</button>
            : <p role="status">Carregando painel…</p>
            : tab === 'Serviços' ? <ServiceSettings services={data.services} execute={execute} busy={busy} />
            : tab === 'Expediente' ? <HoursSettings hours={data.hours} execute={execute} busy={busy} />
            : tab === 'Fidelidade' ? <LoyaltySettings goal={data.goal} execute={execute} busy={busy} />
            : tab === 'Clientes' ? <ClientList data={data} execute={execute} version={version} busy={busy} />
            : tab === 'Ofertas' ? <AdminOffers plan={data.plan} campaigns={data.campaigns} services={data.services} execute={execute} busy={busy} />
            : editing ? <>
              <div className="list-heading"><h2>{editing === 'new' ? 'Novo agendamento' : 'Remarcar atendimento'}</h2>
                <button className="text-button" type="button" onClick={() => setEditing(null)}>Voltar à agenda</button></div>
              <Booking manual appointment={editing === 'new' ? undefined : editing} services={data.services} customers={data.customers}
                onDone={() => { setEditing(null); setVersion((previous) => previous + 1); }} />
            </> : <>
              <div className="list-heading"><h2>Agenda</h2>
                <button className="button primary" type="button" onClick={() => setEditing('new')}><Plus size={19} aria-hidden /> Novo horário</button></div>
              <AdminAgenda data={agenda} week={agendaDay} date={selectedDay} days={days} hours={data.hours}
                execute={execute} busy={busy} move={setEditing} navigate={showDay} />
              {!agenda && error && <button className="button" type="button" onClick={() => { setError(''); setVersion((value) => value + 1); }}>Recarregar agenda</button>}
            </>}
        </div>
      </div>}
  </>;
}


function ClientList({ data, execute, version, busy }: { data: AdminData; execute: Execute; version: number; busy: boolean }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState('');
  const customer = data.customers.find((item) => item.id === selected);
  const customers = data.customers.filter((item) =>
    (filter === 'all' || filter === 'requested' && !!item.plan_requested_at ||
      filter === 'active' && activePlan(item) || filter === 'inactive' && !activePlan(item)) &&
    [item.name, item.email, item.contact_email ?? ''].some((field) => normalizeSearch(field).includes(normalizeSearch(query))));
  const requested = data.customers.filter((item) => item.plan_requested_at).length;
  if (customer) return <ClientDetail key={customer.id} customer={customer} goal={data.goal} plan={data.plan} version={version} busy={busy}
    execute={execute} back={() => setSelected('')} />;
  return <>
    <div className="list-heading"><h2>Clientes</h2>{requested > 0 && <button className="button" type="button"
      onClick={() => { setQuery(''); setFilter('requested'); }}>Solicitações de assinatura ({requested})</button>}</div>
    <div className="filter-bar">
      <label className="filter-search"><span>Buscar cliente</span><div><Search size={17} aria-hidden />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou e-mail" /></div></label>
      <div className="select-field"><span>Assinatura</span><StyledSelect label="Filtrar por assinatura" value={filter} onChange={setFilter} options={[
        { value: 'all', label: 'Todos os clientes' }, { value: 'requested', label: 'Ativação solicitada' },
        { value: 'active', label: 'Assinatura ativa' }, { value: 'inactive', label: 'Sem assinatura ativa' },
      ]} /></div>
    </div>
    {!customers.length && <p className="empty">Nenhum cliente encontrado.</p>}
    <div className="admin-rows">{customers.map((item) => <button className="admin-row customer-row" type="button" key={item.id} onClick={() => setSelected(item.id)}>
      <span><strong>{item.name}</strong><small>{item.contact_email ?? item.email}</small></span>
      {item.plan_requested_at && <span className="agenda-status pending">Ativação solicitada</span>}
      {activePlan(item) && <span className="agenda-status upcoming">Assinatura ativa</span>}
      <ChevronRight size={19} aria-hidden />
    </button>)}</div>
  </>;
}

function ClientDetail({ customer, goal, plan, version, busy, execute, back }: {
  customer: Customer; goal: 5 | 10 | null; plan: Plan; version: number; busy: boolean; execute: Execute; back: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dialog, setDialog] = useState<'edit' | 'payment' | 'end' | null>(null);
  const [historyStatus, setHistoryStatus] = useState('');
  const paymentRequest = useRef('');
  const history = detail?.bookings.filter((entry) => !historyStatus || entry.status === historyStatus);
  useEffect(() => {
    const controller = new AbortController();
    get<Detail>('customer', { id: customer.id }, controller.signal).then(setDetail).catch((failure) => {
      if (!controller.signal.aborted) setError(message(failure));
    });
    return () => controller.abort();
  }, [customer.id, version, retry]);
  return <>
    <button className="text-button" type="button" onClick={back}><ChevronLeft size={17} aria-hidden /> Clientes</button>
    <div className="list-heading client-heading">
      <div><h2>{customer.name}</h2><p className="muted">{customer.contact_email ?? customer.email}</p></div>
      <button className="button" type="button" onClick={() => setDialog('edit')}><Pencil size={16} aria-hidden /> Editar cliente</button>
    </div>
    <div className="config-grid">
      <section className="benefit-card stack">
        <h3>Assinatura</h3><PlanStatus customer={customer} />
        {customer.plan_requested_at && <p className="inline-notice">O cliente solicitou a ativação.</p>}
        {(plan.plan_enabled || activePlan(customer)) && <button className="button primary" type="button" disabled={busy} onClick={() => setDialog('payment')}>
          {activePlan(customer) ? 'Registrar renovação' : 'Registrar pagamento'}
        </button>}
        {activePlan(customer) && <button className="text-button danger" type="button" disabled={busy}
          onClick={() => setDialog('end')}>Encerrar assinatura</button>}
        {detail?.payments.length ? <ul className="plain-list">{detail.payments.map((payment) => <li key={payment.id}>
          {money(payment.amount)} em {dayLabel(studioDay(new Date(payment.paid_at)), 'dd LLL yyyy')}
          <small>Período de {dayLabel(payment.period_start)} a {dayLabel(addDays(payment.period_end, -1))}</small>
        </li>)}</ul> : <p className="muted">Nenhum pagamento registrado.</p>}
      </section>
      <section className="benefit-card stack"><h3>Fidelidade</h3>
        {goal ? <><p>{customer.progress} de {goal} cortes</p><progress max={goal} value={customer.progress} aria-label="Progresso da fidelidade" /></>
          : <p className="muted">Programa desativado.</p>}
        {detail?.rewards.length ? <ul className="plain-list">{detail.rewards.map((reward) => <li key={reward.id}>
          {reward.percent === 100 ? 'Corte grátis' : '50% de desconto'}
          <small>{reward.used_at ? 'Resgatado' : reward.booking_id ? 'Reservado' : 'Disponível'}</small>
        </li>)}</ul> : <p className="muted">Nenhuma recompensa emitida.</p>}
      </section>
    </div>
    <div className="list-heading history-heading"><h3>Histórico de atendimentos</h3>
      {!!detail?.bookings.length && <div className="compact-filter"><StyledSelect label="Status do histórico"
        value={historyStatus} onChange={setHistoryStatus} options={historyStatusOptions} /></div>}
    </div>
    <ErrorText>{error}</ErrorText>
    {error && <button className="button" type="button" onClick={() => { setError(''); setRetry(retry + 1); }}>Tentar novamente</button>}
    {history ? history.length ? history.map((entry) => <AppointmentCard key={entry.id} entry={entry} />)
      : <p className="empty">{historyStatus ? 'Nenhum atendimento com esse status.' : 'Nenhum atendimento registrado.'}</p>
      : !error && <p role="status">Carregando histórico…</p>}
    {dialog === 'edit' && <ActionDialog title="Editar cliente" label="Salvar alterações" close={() => setDialog(null)}
      submit={(form, report) => execute({ action: 'editCustomer', id: customer.id, name: form.get('name'),
        contactEmail: String(form.get('contact') ?? '').trim() || null }, 'Cliente atualizado.', report)}>
      <label>Nome<input name="name" defaultValue={customer.name} minLength={2} maxLength={100} required /></label>
      <label>E-mail de contato<input name="contact" type="email" defaultValue={customer.contact_email ?? customer.email} maxLength={254} /></label>
      <p className="muted">E-mail de acesso: {customer.email}</p>
    </ActionDialog>}
    {dialog === 'payment' && <ActionDialog title="Registrar pagamento" label="Confirmar pagamento" close={() => setDialog(null)}
      submit={async (_, report) => {
        paymentRequest.current ||= crypto.randomUUID();
        const saved = await execute({ action: 'payment', id: customer.id, requestId: paymentRequest.current, amount: plan.plan_price }, 'Pagamento registrado.', report);
        if (saved) paymentRequest.current = '';
        return saved;
      }}>
      <p>Registrar {money(plan.plan_price)} para <strong>{customer.name}</strong>?</p>
      <p className="muted">{activePlan(customer) ? 'O pagamento acrescenta um mês à assinatura atual.' : 'A assinatura será ativada por um mês.'}</p>
      <label className="checkbox"><input type="checkbox" required /> Confirmo que recebi o pagamento</label>
    </ActionDialog>}
    {dialog === 'end' && <ActionDialog title="Encerrar assinatura?" label="Encerrar assinatura" danger close={() => setDialog(null)}
      submit={(_, report) => execute({ action: 'end', id: customer.id, requestId: crypto.randomUUID() }, 'Assinatura encerrada.', report)}>
      <p className="muted">Novas reservas de {customer.name} serão cobradas normalmente.</p>
    </ActionDialog>}
  </>;
}
