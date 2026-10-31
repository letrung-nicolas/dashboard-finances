import { useState } from 'react';
import { createInitialSettings, emptyForm } from '../app/settingsService';
import { messageFor, useSession } from '../app/session';
import type { FieldErrors, SettingsForm } from '../domain';
import { errorsForStep, STEPS } from './settings/sections';

/** Assistant de premier lancement. Rien n'est enregistré avant le bouton final. */
export function Wizard() {
  const { persistSettings } = useSession();
  const [form, setForm] = useState<SettingsForm>(emptyForm());
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  function validateStep(): boolean {
    // Valide tout le formulaire mais n'affiche que les erreurs de l'étape courante.
    const result = createInitialSettings(form);
    const all: FieldErrors = result.ok ? {} : result.errors;
    const mine = errorsForStep(step, all);
    setErrors(mine);
    return Object.keys(mine).length === 0;
  }

  function next() {
    if (validateStep()) setIndex(index + 1);
  }

  async function finish() {
    const result = createInitialSettings(form);
    if (!result.ok) {
      setErrors(errorsForStep(step, result.errors));
      // Une erreur dans une étape précédente : on y retourne.
      const bad = STEPS.findIndex((s) => Object.keys(errorsForStep(s, result.errors)).length > 0);
      if (bad >= 0 && bad !== index) {
        setIndex(bad);
        setErrors(errorsForStep(STEPS[bad], result.errors));
      }
      return;
    }
    setBusy(true);
    try {
      await persistSettings(result.value);
    } catch (e) {
      setFatal(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>Bienvenue</h1>
      <p className="muted">
        Étape {index + 1} sur {STEPS.length} : <strong>{step.title}</strong>. Ces informations restent chiffrées dans ce
        navigateur ; rien n'est envoyé nulle part.
      </p>
      <div className="carte">
        {step.render({ form, errors, onChange: setForm })}
      </div>
      {fatal && <p className="alerte" role="alert">{fatal}</p>}
      <div className="barre-ligne">
        {index > 0 && (
          <button type="button" className="btn-secondaire" onClick={() => { setErrors({}); setIndex(index - 1); }} disabled={busy}>
            Retour
          </button>
        )}
        {!last && (
          <button type="button" className="btn" onClick={next}>
            Suivant
          </button>
        )}
        {last && (
          <button type="button" className="btn" onClick={finish} disabled={busy}>
            {busy ? 'Enregistrement…' : 'Terminer'}
          </button>
        )}
      </div>
    </main>
  );
}
