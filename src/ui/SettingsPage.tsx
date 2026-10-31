import { useState } from 'react';
import { formFromSettings, updateSettings } from '../app/settingsService';
import { messageFor, useSession } from '../app/session';
import type { FieldErrors, SettingsForm } from '../domain';
import { STEPS } from './settings/sections';

/** Réglages modifiables après le premier lancement : toutes les sections sur une seule page. */
export function SettingsPage() {
  const { settings, persistSettings } = useSession();
  const [form, setForm] = useState<SettingsForm | null>(settings ? formFromSettings(settings) : null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!settings || !form) return <p>Chargement…</p>;

  async function save() {
    if (!settings || !form) return;
    setMessage(null);
    const result = updateSettings(form, settings);
    if (!result.ok) {
      setErrors(result.errors);
      setMessage('Certains champs sont à corriger.');
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await persistSettings(result.value);
      setMessage('Réglages enregistrés.');
    } catch (e) {
      setMessage(messageFor(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Réglages</h1>
      {STEPS.map((step) => (
        <section className="carte" key={step.title}>
          <h2>{step.title}</h2>
          {step.render({ form, errors, onChange: setForm })}
        </section>
      ))}
      {message && <p role="status" className={Object.keys(errors).length > 0 ? 'alerte' : 'muted'}>{message}</p>}
      <button className="btn" onClick={save} disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </>
  );
}
