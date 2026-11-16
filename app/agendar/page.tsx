import { Booking } from '@/components/booking';
import { Header } from '@/components/chrome';
import { requireIdentity } from '@/lib/auth';
import { catalog, findCustomer } from '@/lib/booking';
import { db } from '@/lib/db';
import { studioOffers, visibleCampaigns } from '@/lib/campaigns';
import Link from 'next/link';
import { ArrowRight, CreditCard, Megaphone } from 'lucide-react';
import { dayLabel, money, studioDay } from '@/lib/time';

export const metadata = { title: 'Agendar' };

export default async function Page() {
  const person = await requireIdentity();
  const sql = db();
  const [services, customer, plan, campaigns] = await Promise.all([catalog(), findCustomer(sql, person), studioOffers(sql), visibleCampaigns(sql)]);
  const today = studioDay();
  const subscribed = customer?.plan_start && customer.plan_start <= today && customer.plan_end && today < customer.plan_end;
  return <><Header active="booking" /><main className="shell page-body booking-page">
    <div className="page-heading"><h1>Agendar</h1></div>
    {(campaigns.length > 0 || plan.plan_enabled && !subscribed) && <section className="booking-offers" aria-label="Ofertas">
      {plan.plan_enabled && !subscribed && <article className="offer-strip">
        <span className="section-symbol"><CreditCard size={18} aria-hidden /></span>
        <div><h2>{plan.plan_name}</h2><p>{plan.plan_description}</p></div>
        <Link className="button" href="/meus-horarios#assinatura">{money(plan.plan_price)}/mês · Conhecer plano <ArrowRight size={16} aria-hidden /></Link>
      </article>}
      {campaigns.map((campaign) => <article key={campaign.id} className="offer-strip campaign-strip">
        <span className="section-symbol"><Megaphone size={18} aria-hidden /></span>
        <div><h2>{campaign.title}</h2><p>{campaign.description}</p></div>
        {campaign.kind === 'discount' ? <span className="campaign-badge">{campaign.percent}% de desconto · até {dayLabel(studioDay(new Date(campaign.ends_at)), 'dd LLL')}</span>
          : <Link className="text-button" href={'/meus-horarios#' + (campaign.kind === 'loyalty' ? 'fidelidade' : 'assinatura')}>Ver detalhes <ArrowRight size={16} aria-hidden /></Link>}
      </article>)}
    </section>}
    <Booking services={services} needsName={!customer && (person.name?.length ?? 0) < 2} />
  </main></>;
}
