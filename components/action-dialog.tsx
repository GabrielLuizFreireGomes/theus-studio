'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ErrorText } from './chrome';

export function ActionDialog({ title, label, children, close, submit, danger = false }: {
  title: string;
  label: string;
  children: ReactNode;
  close: () => void;
  submit: (data: FormData, reportError: (error: string) => void) => Promise<boolean>;
  danger?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  return <dialog ref={dialog} className="action-dialog" aria-labelledby={titleId} onCancel={(event) => {
    event.preventDefault();
    if (!busy) close();
  }}>
    <form className="stack" noValidate onChange={() => { if (error) setError(''); }} onSubmit={async (event) => {
      event.preventDefault();
      if (busy) return;
      const form = event.currentTarget;
      if (!form.checkValidity()) {
        const field = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:invalid, select:invalid, textarea:invalid');
        setError(field?.validationMessage || 'Confira os campos informados.');
        field?.focus();
        return;
      }
      const data = new FormData(form);
      setBusy(true);
      setError('');
      try { if (await submit(data, setError)) close(); }
      catch { setError('Não foi possível salvar. Tente novamente.'); }
      finally { setBusy(false); }
    }}>
      <h2 id={titleId}>{title}</h2>
      {children}
      <ErrorText>{error}</ErrorText>
      <div className="dialog-actions">
        <button className="button" type="button" disabled={busy} onClick={close}>Voltar</button>
        <button className={'button primary' + (danger ? ' danger-button' : '')} disabled={busy}>{busy ? 'Aguarde…' : label}</button>
      </div>
    </form>
  </dialog>;
}
