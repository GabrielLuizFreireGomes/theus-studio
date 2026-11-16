'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Download } from 'lucide-react';

type InstallPrompt = Event & { prompt: () => Promise<{ outcome: 'accepted' | 'dismissed' }> };
const InstallContext = createContext<{ prompt: InstallPrompt | null; ios: boolean; installed: boolean; clear: () => void }>({
  prompt: null, ios: false, installed: false, clear() {},
});

export function Pwa({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const handlePrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const handleInstalled = () => { setPrompt(null); setInstalled(true); };
    const nav = navigator as Navigator & { standalone?: boolean };
    setIos(/iPhone|iPad|iPod/i.test(nav.userAgent) || (/Mac/i.test(nav.platform) && nav.maxTouchPoints > 1));
    setInstalled(Boolean(nav.standalone || matchMedia('(display-mode: standalone)').matches));
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
    const localizeValidation = (event: Event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return;
      const { validity } = field;
      if (validity.valueMissing) field.setCustomValidity(field instanceof HTMLInputElement && field.type === 'checkbox'
        ? 'Marque esta opção para continuar.' : 'Preencha este campo.');
      else if (validity.typeMismatch && field instanceof HTMLInputElement && field.type === 'email') field.setCustomValidity('Informe um e-mail válido.');
      else if (validity.tooShort && !(field instanceof HTMLSelectElement)) field.setCustomValidity('Informe pelo menos ' + field.minLength + ' caracteres.');
      else if (!validity.customError) field.setCustomValidity('Confira o valor informado neste campo.');
    };
    const clearValidation = (event: Event) => {
      const field = event.target;
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.setCustomValidity('');
    };
    document.addEventListener('invalid', localizeValidation, true);
    document.addEventListener('input', clearValidation, true);
    document.addEventListener('change', clearValidation, true);
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      document.removeEventListener('invalid', localizeValidation, true);
      document.removeEventListener('input', clearValidation, true);
      document.removeEventListener('change', clearValidation, true);
    };
  }, []);
  return <InstallContext.Provider value={{ prompt, ios, installed, clear: () => setPrompt(null) }}>{children}</InstallContext.Provider>;
}

export function InstallApp() {
  const { prompt, ios, installed, clear } = useContext(InstallContext);
  const [instructions, setInstructions] = useState(false);
  if (installed || (!prompt && !ios)) return null;
  return <div className="install-app">
    <button type="button" className="text-button" aria-expanded={ios && !prompt ? instructions : undefined}
      onClick={async () => {
        if (!prompt) { setInstructions(!instructions); return; }
        try { await prompt.prompt(); } finally { clear(); }
      }}><Download size={17} aria-hidden /> Instalar aplicativo</button>
    {instructions && <p className="muted">No Safari, toque em Compartilhar e em Adicionar à Tela de Início.</p>}
  </div>;
}
