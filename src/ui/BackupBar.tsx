import { useState } from 'react';
import { messageFor, useSession } from '../app/session';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR');
}

/** Barre toujours visible quand le coffre est ouvert : sauvegarde, rappel, verrouillage. */
export function BackupBar() {
  const { backup, backupNow, lock } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = backup.changesSinceBackup > 0;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await backupNow();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="barre">
      <div className="barre-ligne">
        <button className="btn" onClick={save} disabled={busy}>
          {busy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}
        </button>
        <button className="btn-secondaire" onClick={lock}>
          Verrouiller
        </button>
      </div>
      <p className="muted petit">
        {backup.lastBackupAt === null
          ? "Aucune sauvegarde faite depuis l'ouverture de ce coffre."
          : 'Dernière sauvegarde : ' + formatDate(backup.lastBackupAt) + '.'}
      </p>
      {pending && (
        <p className="rappel" role="status">
          {backup.changesSinceBackup} modification{backup.changesSinceBackup > 1 ? 's' : ''} non sauvegardée
          {backup.changesSinceBackup > 1 ? 's' : ''} : sauvegardez maintenant. Le navigateur peut effacer ces données
          (changement d'appareil, nettoyage, Safari après une longue absence).
        </p>
      )}
      {error && <p className="alerte" role="alert">{error}</p>}
    </div>
  );
}
