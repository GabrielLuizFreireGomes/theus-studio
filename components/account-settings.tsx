'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, KeyRound, LogOut, Mail } from 'lucide-react';
import { ApiError, message, post, send } from '@/lib/client';
import { ErrorText } from './chrome';
import { InstallApp } from './pwa';

type PushSettings = { publicKey: string | null; registered: boolean; offers: boolean };

async function connectPush<T>(operation: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ApiError('O serviço de notificações não respondeu. Tente novamente.')), 12_000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export function AccountSettings({ email }: { email: string }) {
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(supported);
    if (supported) setPermission(Notification.permission);
    fetch('/api/push', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      return await response.json() as PushSettings;
    }).then(setSettings).catch(() => {
      if (!controller.signal.aborted) setError('Não foi possível consultar as notificações.');
    });
    return () => controller.abort();
  }, []);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await task(); } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }

  async function toggle() {
    if (!settings?.publicKey) return;
    if (settings.registered) {
      await send('/api/push', { action: 'disable' });
      setSettings({ ...settings, registered: false, offers: false });
      const worker = await navigator.serviceWorker.getRegistration();
      await (await worker?.pushManager.getSubscription())?.unsubscribe();
      return;
    }
    const granted = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPermission(granted);
    if (granted === 'denied') return;
    if (granted !== 'granted') throw new ApiError('Permita as notificações no navegador para ativá-las.');
    const active = await connectPush(navigator.serviceWorker.ready);
    const chars = settings.publicKey.replaceAll('-', '+').replaceAll('_', '/');
    const key = Uint8Array.from(atob(chars.padEnd(Math.ceil(chars.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
    const existing = await active.pushManager.getSubscription();
    const existingKey = existing?.options.applicationServerKey;
    const rotated = existingKey && new Uint8Array(existingKey).some((value, index) => value !== key[index]);
    if (rotated) await existing.unsubscribe();
    const subscription = (rotated ? null : existing) ?? await connectPush(active.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: key,
    }).catch(() => { throw new ApiError('Este navegador não conseguiu ativar as notificações.'); }));
    try {
      await send('/api/push', { ...subscription.toJSON(), action: 'enable' });
      setSettings({ ...settings, registered: true, offers: false });
    } catch (failure) {
      await subscription.unsubscribe();
      throw failure;
    }
  }

  return <div className="account-settings">
    <section className="booking-panel stack">
      <div className="panel-title"><Mail size={18} aria-hidden /><h2>Acesso</h2></div>
      <p className="account-email">{email}</p>
      <Link href="/recuperar-senha" className="text-button"><KeyRound size={17} aria-hidden /> Redefinir senha</Link>
    </section>
    <section className="booking-panel stack">
      <div className="panel-title"><Bell size={18} aria-hidden /><h2>Notificações</h2></div>
      <p className="muted">Receba lembretes e avisos quando o barbeiro alterar seu horário.</p>
      {settings && !settings.publicKey ? <p className="muted">Notificações indisponíveis neste ambiente.</p>
        : settings && !supported ? <p className="muted">Notificações indisponíveis neste navegador. No iPhone, abra o app pela tela de início.</p>
        : permission === 'denied' && !settings?.registered ? <p className="muted">As notificações estão bloqueadas nas permissões do navegador.</p>
        : settings && <button type="button" className="button" disabled={busy} onClick={() => void run(toggle)}>
          {settings.registered ? 'Desativar neste dispositivo' : 'Ativar neste dispositivo'}</button>}
      {settings?.registered && <label className="checkbox"><input type="checkbox" checked={settings.offers} disabled={busy}
        onChange={(event) => {
          const enabled = event.currentTarget.checked;
          void run(async () => { await send('/api/push', { action: 'offers', enabled }); setSettings({ ...settings, offers: enabled }); });
        }} /> Receber promoções e novidades neste dispositivo</label>}
    </section>
    <InstallApp />
    <ErrorText>{error}</ErrorText>
    <button type="button" className="text-button danger" disabled={busy} onClick={() => void run(async () => {
      await post({ action: 'logout' });
      window.location.replace('/entrar');
    })}><LogOut size={17} aria-hidden /> Sair</button>
  </div>;
}
