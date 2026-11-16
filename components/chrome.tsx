import Link from 'next/link';
import { CalendarDays, CalendarPlus, UserRound } from 'lucide-react';

export function Wordmark() {
  return <span className="wordmark" aria-label="Theus Studio"><strong>Theus</strong><span>studio</span></span>;
}

export function Header({ admin = false, active }: { admin?: boolean; active?: 'booking' | 'bookings' | 'account' }) {
  return <header className="site-header">
    <div className="shell header-inner">
      <Link href={admin ? '/admin' : '/agendar'} className="brand"><Wordmark /></Link>
      {!admin && <nav aria-label="Principal" className="app-nav">
        <Link href="/agendar" aria-current={active === 'booking' ? 'page' : undefined}><CalendarPlus size={17} aria-hidden />Agendar</Link>
        <Link href="/meus-horarios" aria-current={active === 'bookings' ? 'page' : undefined}><CalendarDays size={17} aria-hidden />Meus horários</Link>
        <Link href="/conta" aria-current={active === 'account' ? 'page' : undefined}><UserRound size={17} aria-hidden />Conta</Link>
      </nav>}
    </div>
  </header>;
}

export function ErrorText({ children }: { children: string }) {
  return children ? <p role="alert" className="error">{children}</p> : null;
}
