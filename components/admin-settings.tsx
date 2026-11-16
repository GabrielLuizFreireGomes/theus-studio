'use client';

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { dayAt, studioDay } from '@/lib/time';
import { normalizeSearch } from '@/lib/admin-agenda';
import type { Hours, Service } from '@/lib/types';
import { StyledSelect } from './styled-select';

export type Execute = (command: Record<string, unknown>, notice: string, reportError?: (message: string) => void) => Promise<boolean>;
const weekdays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

function clock(value: number | null | undefined) {
  if (value == null) return '';
  return [Math.floor(value / 60), value % 60].map((part) => String(part).padStart(2, '0')).join(':');
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function ServiceSettings({ services, execute, busy }: { services: Service[]; execute: Execute; busy: boolean }) {
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const visible = services.filter((item) => (status === 'all' || item.active === (status === 'active')) &&
    normalizeSearch(item.name).includes(normalizeSearch(query)));
  const service = editing === 'new' ? undefined : editing ?? undefined;
  return <>
    <div className="list-heading"><h2>Serviços</h2><button className="button primary" type="button" onClick={() => setEditing('new')}><Plus size={18} aria-hidden /> Novo serviço</button></div>
    {editing && <form key={service?.id ?? 'new'} className="booking-panel stack" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const ok = await execute({ action: 'service', service: {
        id: service?.id, name: data.get('name'), description: data.get('description'),
        duration: Number(data.get('duration')), price: Math.round(Number(data.get('price')) * 100),
        is_cut: data.has('cut'), active: data.has('active'),
      } }, 'Serviço salvo.');
      if (ok) setEditing(null);
    }}>
      <h3>{service ? 'Editar serviço' : 'Novo serviço'}</h3>
      <label>Nome<input name="name" defaultValue={service?.name} maxLength={100} minLength={2} required /></label>
      <label>Descrição<textarea name="description" defaultValue={service?.description} maxLength={240} rows={2} /></label>
      <div className="form-split">
        <label>Preço em reais<input name="price" type="number" min="0" max="100000" step="0.01" defaultValue={service ? service.price / 100 : ''} required /></label>
        <label>Duração em minutos<input name="duration" type="number" min="5" max="480" defaultValue={service?.duration ?? 30} required /></label>
      </div>
      <label className="checkbox"><input type="checkbox" name="cut" defaultChecked={service?.is_cut} /> Corte elegível para assinatura e fidelidade</label>
      <label className="checkbox"><input type="checkbox" name="active" defaultChecked={service?.active ?? true} /> Disponível para agendar</label>
      <div className="inline-actions"><button className="button primary" disabled={busy}>Salvar serviço</button>
        <button className="text-button" type="button" onClick={() => setEditing(null)}>Fechar</button></div>
    </form>}
    <div className="filter-bar"><label>Buscar serviço<input type="search" placeholder="Nome do serviço" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="select-field"><span>Status</span><StyledSelect label="Status do serviço" value={status} onChange={setStatus} options={[
        { value: 'all', label: 'Todos os serviços' }, { value: 'active', label: 'Ativos' }, { value: 'inactive', label: 'Inativos' },
      ]} /></div></div>
    {!visible.length && <p className="empty">{services.length ? 'Nenhum serviço encontrado.' : 'Cadastre um serviço para começar a receber agendamentos.'}</p>}
    <div className="admin-rows">{visible.map((item) => <article className="admin-row" key={item.id}>
      <div><h3>{item.name}</h3><p>{item.duration} min · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price / 100)}</p></div>
      <span className={item.active ? 'status completed' : 'status'}>{item.active ? 'Ativo' : 'Inativo'}</span>
      <button className="text-button" type="button" onClick={() => setEditing(item)}>Editar</button>
    </article>)}</div>
  </>;
}

export function HoursSettings({ hours, execute, busy }: { hours: Hours[]; execute: Execute; busy: boolean }) {
  const [day, setDay] = useState(1);
  const current = hours.find((item) => item.weekday === day);
  const [closedOverride, setClosedOverride] = useState<boolean | null>(null);
  const closed = closedOverride ?? !current;
  return <>
    <h2>Expediente e bloqueios</h2>
    <div className="config-grid">
      <section className="booking-panel stack">
        <h3>Expediente semanal</h3>
        <div className="select-field"><span>Dia da semana</span><StyledSelect label="Dia da semana" value={String(day)} onChange={(value) => {
          setClosedOverride(null);
          setDay(Number(value));
        }} options={weekdays.map((label, index) => ({ label, value: String(index + 1) }))} /></div>
        <form key={day} className="stack" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const breakStart = String(form.get('break_start') ?? '');
          const breakEnd = String(form.get('break_end') ?? '');
          const updated = closed ? undefined : { opens: minutes(String(form.get('opens'))), closes: minutes(String(form.get('closes'))),
            break_start: breakStart ? minutes(breakStart) : null, break_end: breakEnd ? minutes(breakEnd) : null };
          if (await execute({ action: 'hours', weekday: day, hours: updated }, 'Expediente atualizado.')) setClosedOverride(null);
        }}>
          <label className="checkbox"><input type="checkbox" checked={closed} onChange={(event) => setClosedOverride(event.target.checked)} /> Fechado nesse dia</label>
          {!closed && <>
            <div className="form-split">
              <label>Abertura<input type="time" name="opens" defaultValue={clock(current?.opens) || '09:00'} required /></label>
              <label>Fechamento<input type="time" name="closes" defaultValue={clock(current?.closes) || '18:00'} required /></label>
            </div>
            <div className="form-split">
              <label>Início do intervalo<input type="time" name="break_start" defaultValue={clock(current?.break_start)} /></label>
              <label>Fim do intervalo<input type="time" name="break_end" defaultValue={clock(current?.break_end)} /></label>
            </div>
          </>}
          <button className="button primary" disabled={busy}>Salvar expediente</button>
        </form>
      </section>
      <form className="booking-panel stack" onSubmit={async (event) => {
        event.preventDefault();
        const target = event.currentTarget;
        const form = new FormData(target);
        function instant(key: string) {
          const [date, time] = String(form.get(key)).split('T');
          return dayAt(date, minutes(time)).toISOString();
        }
        if (await execute({ action: 'block', title: form.get('title'), startsAt: instant('starts'), endsAt: instant('ends') }, 'Horário bloqueado.')) target.reset();
      }}>
        <h3>Bloquear um período</h3>
        <p className="muted">O bloqueio aparece na agenda, onde também pode ser removido.</p>
        <label>Motivo<input name="title" placeholder="Ex.: compromisso" minLength={2} maxLength={100} required /></label>
        <label>Início<input name="starts" type="datetime-local" min={studioDay() + 'T00:00'} required /></label>
        <label>Fim<input name="ends" type="datetime-local" min={studioDay() + 'T00:00'} required /></label>
        <button className="button primary" disabled={busy}>Bloquear horário</button>
      </form>
    </div>
  </>;
}

export function LoyaltySettings({ goal, execute, busy }: { goal: 5 | 10 | null; execute: Execute; busy: boolean }) {
  return <form className="booking-panel stack" key={goal ?? 'off'} onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = Number(data.get('goal'));
    void execute({ action: 'goal', goal: next || null, reset: data.has('reset') }, 'Fidelidade atualizada.');
  }}>
    <h2>Fidelidade</h2>
    <div className="select-field"><span>Modalidade</span><StyledSelect label="Modalidade" defaultValue={String(goal ?? 0)} name="goal" options={[
      { value: '0', label: 'Desativada' }, { value: '5', label: '5 cortes · 50% de desconto' }, { value: '10', label: '10 cortes · um corte grátis' },
    ]} /></div>
    <label className="checkbox"><input name="reset" type="checkbox" /> Confirmo o reinício dos ciclos incompletos se mudar a modalidade.</label>
    <p className="muted">Recompensas já emitidas continuam disponíveis.</p>
    <button className="button primary" disabled={busy}>Salvar modalidade</button>
  </form>;
}
