import { useState } from 'react';
import { isCryptoAvailable, measureDerivationMs, MIN_ITERATIONS } from '../crypto';

type Etat =
  | { phase: 'attente' }
  | { phase: 'mesure' }
  | { phase: 'fait'; essais: number[] }
  | { phase: 'erreur'; message: string };

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function CryptoBench() {
  const [etat, setEtat] = useState<Etat>({ phase: 'attente' });
  const disponible = isCryptoAvailable();

  async function lancer() {
    setEtat({ phase: 'mesure' });
    try {
      const essais: number[] = [];
      for (let i = 0; i < 3; i++) essais.push(Math.round(await measureDerivationMs(MIN_ITERATIONS)));
      setEtat({ phase: 'fait', essais });
    } catch (e) {
      setEtat({ phase: 'erreur', message: e instanceof Error ? e.message : 'Erreur inconnue' });
    }
  }

  return (
    <main className="page">
      <h1>Vitesse du chiffrement</h1>
      <p className="muted">
        Mesure le temps que met cet appareil à transformer votre mot de passe en clé
        ({MIN_ITERATIONS.toLocaleString('fr-FR')} itérations). Aucune donnée n'est utilisée ni envoyée.
      </p>
      {!disponible && (
        <p className="alerte">Le chiffrement n'est pas disponible ici (HTTPS requis ou navigateur trop ancien).</p>
      )}
      <button className="btn" onClick={lancer} disabled={!disponible || etat.phase === 'mesure'}>
        {etat.phase === 'mesure' ? 'Mesure en cours…' : 'Mesurer'}
      </button>
      {etat.phase === 'fait' && (
        <p>
          Résultats : {etat.essais.map((ms) => ms + ' ms').join(' · ')}. Médiane :{' '}
          <strong>{median(etat.essais)} ms</strong>.
        </p>
      )}
      {etat.phase === 'erreur' && <p className="alerte">Échec : {etat.message}</p>}
    </main>
  );
}
