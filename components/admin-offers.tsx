'use client';

import { useState } from 'react';
import { CalendarClock, CreditCard, Megaphone, Plus } from 'lucide-react';
import { dayAt, dayLabel, hourLabel, money, studioDay } from '@/lib/time';
import type { Campaign, Plan, Service } from '@/lib/types';
import { ActionDialog } from './action-dialog';
import type { Execute } from './admin-settings';
import { StyledSelect } from './styled-select';

const kinds = { discount: 'Desconto em serviço', loyalty: 'Divulgação da fidelidade', subscription: 'Divulgação da assinatura' };
const kindsList = Object.entries(kinds).map(([value, label]) => ({ value, label }));

function instant(value: string) {
  const [date, clock] = value.split('T');
  const [hour, minute] = clock.split(':').map(Number);
  return dayAt(date, hour * 60 + minute).toISOString();
}

function localValue(value?: string) {
  return value ? studioDay(new Date(value)) + 'T' + hourLabel(value) : '';
}

function dateTime(value: string) {
  return dayLabel(studioDay(new Date(value))) + ' às ' + hourLabel(value);
}

export function AdminOffers({ plan, campaigns, services, execute, busy }: {
  plan: Plan; campaigns: Campaign[]; services: Service[]; execute: Execute; busy: boolean;
}) {
  const [editor, setEditor] = useState<Campaign | 'new' | null>(null);
  const [kind, setKind] = useState<Campaign['kind']>('discount');
  const [ending, setEnding] = useState<Campaign | null>(null);
  const campaign = editor === 'new' ? null : editor;
  const now = Date.now();
  return <div className="offer-admin stack">
    <div className="list-heading"><h2>Ofertas</h2><button className="button primary" type="button"
      onClick={() => { setKind('discount'); setEditor('new'); }}><Plus size={18} aria-hidden /> Nova campanha</button></div>
    <form className="booking-panel stack" key={JSON.stringify(plan)} onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void execute({ action: 'plan', plan: {
        plan_enabled: form.has('published'), plan_name: form.get('name'), plan_description: form.get('description'),
        plan_price: Math.round(Number(form.get('price')) * 100),
      } }, 'Plano atualizado.');
    }}>
      <div className="panel-title"><CreditCard size={18} aria-hidden /><h3>Assinatura</h3></div>
      <div className="form-split">
        <label>Nome do plano<input name="name" required minLength={2} maxLength={100} defaultValue={plan.plan_name} /></label>
        <label>Mensalidade (R$)<input name="price" type="number" min=".01" max="100000" step=".01" required defaultValue={plan.plan_price / 100} /></label>
      </div>
      <label>Descrição<textarea name="description" rows={2} minLength={4} maxLength={280} required defaultValue={plan.plan_description} /></label>
      <label className="checkbox"><input name="published" type="checkbox" defaultChecked={plan.plan_enabled} /> Exibir oferta para novas assinaturas</label>
      <button className="button primary" disabled={busy}>Salvar plano</button>
    </form>
    {editor && <form key={campaign?.id ?? 'new'} className="booking-panel stack" onSubmit={async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const saved = await execute({ action: 'campaign', campaign: {
        id: campaign?.id, title: form.get('title'), description: form.get('description'), kind,
        percent: kind === 'discount' ? Number(form.get('percent')) : null,
        service_id: kind === 'discount' && form.get('service') !== 'all' ? form.get('service') : null,
        starts_at: instant(String(form.get('starts'))), ends_at: instant(String(form.get('ends'))), notify: form.has('notify'),
      } }, 'Campanha salva.');
      if (saved) setEditor(null);
    }}>
      <div className="panel-title"><Megaphone size={18} aria-hidden /><h3>{campaign ? 'Editar campanha' : 'Programar campanha'}</h3></div>
      <div className="select-field"><span>Tipo de campanha</span><StyledSelect label="Tipo de campanha" options={kindsList}
        value={kind} onChange={(value) => setKind(value as Campaign['kind'])} /></div>
      <label>Título<input name="title" required minLength={2} maxLength={100} defaultValue={campaign?.title} /></label>
      <label>Mensagem para os clientes<textarea name="description" rows={2} required minLength={4} maxLength={280} defaultValue={campaign?.description} /></label>
      {kind === 'discount' && <div className="form-split">
        <label>Desconto (%)<input name="percent" type="number" min="1" max="100" required defaultValue={campaign?.percent ?? 15} /></label>
        <div className="select-field"><span>Serviço</span><StyledSelect label="Serviço da promoção" name="service"
          defaultValue={campaign?.service_id ?? 'all'} options={[{ value: 'all', label: 'Todos os serviços' },
            ...services.filter((service) => service.active || service.id === campaign?.service_id).map((service) => ({ value: service.id, label: service.name })),
          ]} /></div>
      </div>}
      <div className="form-split">
        <label>Início<input name="starts" type="datetime-local" required defaultValue={localValue(campaign?.starts_at)} /></label>
        <label>Fim<input name="ends" type="datetime-local" required defaultValue={localValue(campaign?.ends_at)} /></label>
      </div>
      <label className="checkbox"><input name="notify" type="checkbox" defaultChecked={campaign?.notify ?? true} /> Notificar clientes que ativaram promoções</label>
      <div className="inline-actions"><button className="button primary" disabled={busy}>Salvar campanha</button>
        <button type="button" className="text-button" onClick={() => setEditor(null)}>Fechar</button></div>
    </form>}
    <h3>Campanhas</h3>
    {!campaigns.length && <p className="empty">Nenhuma campanha cadastrada.</p>}
    {campaigns.map((item) => {
      const pending = item.enabled && +new Date(item.starts_at) > now;
      const live = item.enabled && !pending && +new Date(item.ends_at) > now;
      return <article className="booking-panel staff-campaign" key={item.id}>
        <div className="list-heading"><div><small className="muted">{kinds[item.kind]}</small><h3>{item.title}</h3></div>
          <span className={live ? 'status completed' : 'status'}>{pending ? 'Programada' : live ? 'Em vigor' : 'Encerrada'}</span></div>
        <p>{item.description}</p>
        <p className="muted"><CalendarClock size={16} aria-hidden /> {dateTime(item.starts_at)} → {dateTime(item.ends_at)}</p>
        {(pending || live) && <div className="inline-actions">
          {pending && <button className="text-button" type="button" onClick={() => { setKind(item.kind); setEditor(item); }}>Editar campanha</button>}
          <button className="text-button danger" type="button" onClick={() => setEnding(item)}>Encerrar campanha</button>
        </div>}
      </article>;
    })}
    {ending && <ActionDialog title="Encerrar campanha?" label="Encerrar campanha" danger close={() => setEnding(null)}
      submit={(_, report) => execute({ action: 'disableCampaign', id: ending.id }, 'Campanha encerrada.', report)}>
      <p>{ending.title}</p>
    </ActionDialog>}
  </div>;
}
