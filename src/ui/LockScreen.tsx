import { useState } from 'react';
import type { FormEvent } from 'react';
import { messageFor, useSession } from '../app/session';
import { MIN_PASSWORD_LENGTH } from '../crypto';
import { readFileAsText } from './download';

function Creation() {
  const { createVault } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await createVault(password);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <form className="carte" onSubmit={submit}>
      <h2>Créer votre coffre</h2>
      <p className="muted">
        Choisissez un mot de passe. Il chiffre vos données dans ce navigateur : personne d'autre ne peut les lire.
      </p>
      <label>
        Mot de passe ({MIN_PASSWORD_LENGTH} caractères minimum)
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <label>
        Confirmez le mot de passe
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <label className="case">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        <span>
          J'ai compris : <strong>si je perds ce mot de passe, mes données sont perdues</strong>, personne ne peut les récupérer.
        </span>
      </label>
      {error && <p className="alerte" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy || !understood || password.length === 0}>
        {busy ? 'Création en cours…' : 'Créer le coffre'}
      </button>
    </form>
  );
}

function Deverrouillage() {
  const { unlock } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unlock(password);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <form className="carte" onSubmit={submit}>
      <h2>Déverrouiller</h2>
      <label>
        Mot de passe
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="alerte" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy || password.length === 0}>
        {busy ? 'Ouverture…' : 'Déverrouiller'}
      </button>
    </form>
  );
}

function Restauration({ replacing }: { replacing: boolean }) {
  const { restore } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(!replacing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      await restore(await readFileAsText(file), password);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }

  return (
    <form className="carte" onSubmit={submit}>
      <h2>Restaurer une sauvegarde</h2>
      <p className="muted">
        Choisissez votre fichier <code>.sauvegarde.json</code> et le mot de passe qu'il utilisait au moment de la sauvegarde.
      </p>
      <label>
        Fichier de sauvegarde
        <input type="file" accept=".json,application/json" onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
      </label>
      <label>
        Mot de passe de la sauvegarde
        <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {replacing && (
        <label className="case">
          <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
          <span>Je comprends que cela <strong>remplace toutes les données actuelles</strong> de cet appareil.</span>
        </label>
      )}
      {error && <p className="alerte" role="alert">{error}</p>}
      <button className="btn" type="submit" disabled={busy || !file || password.length === 0 || !confirmReplace}>
        {busy ? 'Restauration…' : 'Restaurer'}
      </button>
    </form>
  );
}

export function LockScreen() {
  const { status, error } = useSession();
  return (
    <main className="page">
      <h1>Finances</h1>
      <p className="muted">Application 100 % locale : vos données restent chiffrées dans ce navigateur.</p>
      {status === 'loading' && <p>Chargement…</p>}
      {status === 'error' && (
        <p className="alerte" role="alert">
          {error || 'Stockage indisponible.'} Cette application a besoin du stockage du navigateur (désactivez la navigation privée).
        </p>
      )}
      {status === 'no-vault' && (
        <>
          <Creation />
          <Restauration replacing={false} />
        </>
      )}
      {status === 'locked' && (
        <>
          <Deverrouillage />
          <details>
            <summary>Restaurer une sauvegarde à la place</summary>
            <Restauration replacing={true} />
          </details>
        </>
      )}
    </main>
  );
}
