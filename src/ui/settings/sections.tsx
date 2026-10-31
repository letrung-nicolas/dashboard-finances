import type { ReactNode } from 'react';
import { newId } from '../../app/settingsService';
import type { FieldErrors, SettingsForm } from '../../domain';

interface SectionProps {
  form: SettingsForm;
  errors: FieldErrors;
  onChange(next: SettingsForm): void;
}

function Field(props: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label>
      {props.label}
      {props.hint && <span className="muted petit"> {props.hint}</span>}
      {props.children}
      {props.error && (
        <span className="alerte petit" role="alert">
          {props.error}
        </span>
      )}
    </label>
  );
}

export function RevenusSection({ form, errors, onChange }: SectionProps) {
  return (
    <>
      <Field label="Revenu mensuel net (€)" hint="ce qui arrive sur le compte chaque mois" error={errors.income}>
        <input type="text" inputMode="decimal" value={form.income} onChange={(e) => onChange({ ...form, income: e.target.value })} />
      </Field>
      <Field label="Jour de versement du revenu" hint="de 1 à 31" error={errors.payDay}>
        <input type="text" inputMode="numeric" value={form.payDay} onChange={(e) => onChange({ ...form, payDay: e.target.value })} />
      </Field>
    </>
  );
}

export function DecouvertSection({ form, errors, onChange }: SectionProps) {
  return (
    <>
      <p className="muted">Laissez vide si vous n'avez pas de découvert autorisé.</p>
      <Field label="Découvert autorisé (€)" error={errors.overdraftLimit}>
        <input type="text" inputMode="decimal" value={form.overdraftLimit} onChange={(e) => onChange({ ...form, overdraftLimit: e.target.value })} />
      </Field>
      <Field label="Taux débiteur annuel (%)" hint="écrit sur votre relevé" error={errors.overdraftRate}>
        <input type="text" inputMode="decimal" value={form.overdraftRate} onChange={(e) => onChange({ ...form, overdraftRate: e.target.value })} />
      </Field>
    </>
  );
}

export function CreditsSection({ form, errors, onChange }: SectionProps) {
  function patch(index: number, change: Partial<SettingsForm['loans'][number]>) {
    onChange({ ...form, loans: form.loans.map((l, i) => (i === index ? { ...l, ...change } : l)) });
  }
  return (
    <>
      <p className="muted">Un bloc par crédit en cours. Aucun crédit ? Passez à la suite.</p>
      {form.loans.map((loan, i) => (
        <div className="carte" key={loan.id}>
          <Field label="Nom du crédit" hint="facultatif, pour vous y retrouver">
            <input type="text" value={loan.label} onChange={(e) => patch(i, { label: e.target.value })} />
          </Field>
          <Field label="Mensualité (€)" error={errors['loans.' + i + '.payment']}>
            <input type="text" inputMode="decimal" value={loan.payment} onChange={(e) => patch(i, { payment: e.target.value })} />
          </Field>
          <Field label="Taux annuel (%)" error={errors['loans.' + i + '.rate']}>
            <input type="text" inputMode="decimal" value={loan.rate} onChange={(e) => patch(i, { rate: e.target.value })} />
          </Field>
          <Field label="Date de fin" hint="AAAA-MM-JJ, par exemple 2029-06-30" error={errors['loans.' + i + '.endDate']}>
            <input type="text" inputMode="numeric" placeholder="AAAA-MM-JJ" value={loan.endDate} onChange={(e) => patch(i, { endDate: e.target.value })} />
          </Field>
          <button type="button" className="btn-secondaire" onClick={() => onChange({ ...form, loans: form.loans.filter((_, j) => j !== i) })}>
            Retirer ce crédit
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondaire"
        onClick={() =>
          onChange({ ...form, loans: form.loans.concat([{ id: newId('loan'), label: '', payment: '', rate: '', endDate: '' }]) })
        }
      >
        Ajouter un crédit
      </button>
    </>
  );
}

export function EnveloppesSection({ form, errors, onChange }: SectionProps) {
  function patch(index: number, change: Partial<SettingsForm['envelopes'][number]>) {
    onChange({ ...form, envelopes: form.envelopes.map((e, i) => (i === index ? { ...e, ...change } : e)) });
  }
  return (
    <>
      <p className="muted">
        Trois enveloppes de dépenses avec un plafond mensuel chacune. Vous pouvez renommer les enveloppes.
      </p>
      {errors.envelopes && <p className="alerte" role="alert">{errors.envelopes}</p>}
      {form.envelopes.map((env, i) => (
        <div className="carte" key={env.id}>
          <Field label={'Enveloppe ' + (i + 1)} error={errors['envelopes.' + i + '.name']}>
            <input type="text" value={env.name} onChange={(e) => patch(i, { name: e.target.value })} />
          </Field>
          <Field label="Plafond mensuel (€)" hint="0 si aucun" error={errors['envelopes.' + i + '.cap']}>
            <input type="text" inputMode="decimal" value={env.cap} onChange={(e) => patch(i, { cap: e.target.value })} />
          </Field>
        </div>
      ))}
    </>
  );
}

export function ConfidentialiteSection({ form, errors, onChange }: SectionProps) {
  return (
    <>
      <p className="muted">
        Mots à ne jamais laisser sortir quand vous préparerez une analyse pour Claude : votre nom, celui de vos
        proches, votre rue, votre employeur… Un mot par ligne (ou séparés par des virgules).
      </p>
      <Field label="Mots à masquer" error={errors.maskWords}>
        <textarea rows={5} value={form.maskWords} onChange={(e) => onChange({ ...form, maskWords: e.target.value })} />
      </Field>
    </>
  );
}

export interface StepDef {
  title: string;
  /** Préfixes des champs d'erreur propres à cette étape. */
  fields: string[];
  render(props: SectionProps): ReactNode;
}

export const STEPS: StepDef[] = [
  { title: 'Revenus', fields: ['income', 'payDay'], render: (p) => <RevenusSection {...p} /> },
  { title: 'Découvert', fields: ['overdraft'], render: (p) => <DecouvertSection {...p} /> },
  { title: 'Crédits en cours', fields: ['loans'], render: (p) => <CreditsSection {...p} /> },
  { title: 'Enveloppes', fields: ['envelopes'], render: (p) => <EnveloppesSection {...p} /> },
  { title: 'Confidentialité', fields: ['maskWords'], render: (p) => <ConfidentialiteSection {...p} /> },
];

export function errorsForStep(step: StepDef, errors: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  Object.keys(errors).forEach((key) => {
    if (step.fields.some((prefix) => key === prefix || key.indexOf(prefix) === 0)) out[key] = errors[key];
  });
  return out;
}
