'use client';

import { Header } from '@/components/chrome';

export default function Error({ reset }: { reset: () => void }) {
  return <><Header active="booking" /><main className="shell page-body">
    <h1>Agendar</h1><p className="error">Não foi possível carregar os serviços.</p>
    <button type="button" className="button" onClick={reset}>Tentar novamente</button>
  </main></>;
}
