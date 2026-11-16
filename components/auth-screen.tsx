'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, MailCheck } from 'lucide-react';
import { message, send } from '@/lib/client';
import { ErrorText, Wordmark } from './chrome';
import { InstallApp } from './pwa';
import { passwordError } from '@/lib/form-validation';

type Mode = 'login' | 'signup' | 'recover' | 'reset' | 'confirmEmail';
const labels: Record<Mode, { title: string; button: string }> = {
  login: { title: 'Entrar', button: 'Entrar' },
  signup: { title: 'Criar conta', button: 'Criar conta' },
  recover: { title: 'Recuperar senha', button: 'Enviar link' },
  reset: { title: 'Definir nova senha', button: 'Salvar nova senha' },
  confirmEmail: { title: 'Confirmar e-mail', button: 'Confirmar e-mail' },
};

export function AuthScreen({ mode, token, admin = false, notice }: { mode: Mode; token?: string; admin?: boolean; notice?: string }) {
  const [visible, setVisible] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = admin ? '/admin/entrar' : '/entrar';
  const recovery = admin ? '/admin/recuperar-senha' : '/recuperar-senha';
  const hasEmail = mode === 'login' || mode === 'signup' || mode === 'recover';
  const hasPassword = mode === 'login' || mode === 'signup' || mode === 'reset';
  const missingToken = (mode === 'reset' || mode === 'confirmEmail') && !token;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const email = String(fields.email ?? '').trim();
    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Informe um e-mail válido.');
      return;
    }
    if (mode === 'signup' && String(fields.name ?? '').trim().length < 2) {
      setError('Informe seu nome com pelo menos 2 caracteres.');
      return;
    }
    if (hasPassword) {
      const password = String(fields.password ?? '');
      const issue = mode === 'login' ? (password ? '' : 'Informe sua senha.') : passwordError(password);
      if (issue) { setError(issue); return; }
    }
    setBusy(true);
    setError('');
    try {
      await send('/api/auth', { ...fields, email, action: mode, token, admin });
      switch (mode) {
        case 'login': window.location.replace(admin ? '/admin' : '/agendar'); break;
        case 'confirmEmail': window.location.replace(login + '?confirmado=1'); break;
        case 'reset': window.location.replace(login + '?senha=1'); break;
        default: setSent(true);
      }
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <div className="auth-box">
      <Wordmark />
      <section className="auth-card" aria-labelledby="auth-title">
        <h1 id="auth-title">{admin && mode === 'login' ? 'Entrar no painel' : labels[mode].title}</h1>
        {notice && <p className="inline-notice" role="status">{notice}</p>}
        {sent ? <div className="stack auth-sent" role="status">
          <MailCheck size={24} aria-hidden />
          <p>{mode === 'signup' ? 'Confira sua caixa de entrada para confirmar o cadastro.' : 'Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha.'}</p>
          <Link className="text-button" href={login}>Voltar para entrar</Link>
        </div> : missingToken ? <div className="stack">
          <p className="error">O link está incompleto. Abra o endereço enviado para seu e-mail.</p>
          <Link className="text-button" href={mode === 'reset' ? recovery : login}>Voltar</Link>
        </div> : <form className="stack" noValidate onSubmit={submit}>
          {mode === 'signup' && <label>Nome<input name="name" autoComplete="name" minLength={2} maxLength={100} required /></label>}
          {hasEmail && <label>E-mail<input name="email" type="email" autoComplete={mode === 'login' ? 'username' : 'email'} maxLength={254} required /></label>}
          {hasPassword && <div className="password-field">
            <label htmlFor="auth-password">{mode === 'reset' ? 'Nova senha' : 'Senha'}</label>
            <div className="password-input">
              <input id="auth-password" name="password" type={visible ? 'text' : 'password'} required
                maxLength={mode === 'login' ? 256 : 72}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                aria-describedby={mode === 'login' ? undefined : 'password-hint'} />
              <button className="icon-button" type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            {mode !== 'login' && <small id="password-hint" className="muted">Use pelo menos 8 caracteres.</small>}
          </div>}
          {mode === 'login' && <Link className="text-button forgot-link" href={recovery}>Esqueci a senha</Link>}
          <ErrorText>{error}</ErrorText>
          <button className="button primary auth-submit" disabled={busy}>{busy ? 'Aguarde…' : labels[mode].button}<ArrowRight size={17} aria-hidden /></button>
          {mode === 'login' && !admin && <p className="auth-switch">Primeiro acesso? <Link href="/cadastro">Criar conta</Link></p>}
          {mode !== 'login' && <Link className="text-button" href={login}>Voltar para entrar</Link>}
        </form>}
      </section>
      {mode === 'login' && !admin && <InstallApp />}
    </div>
  </main>;
}
