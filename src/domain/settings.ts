import { isIsoDate } from './dates';
import { formatCentsPlain, parseFrenchAmount } from './money';
import type { Cents, IsoDate } from './types';

// Réglages saisis dans l'application et stockés CHIFFRÉS. Aucune valeur par défaut personnelle :
// seuls les noms des enveloppes sont préremplis, et les plafonds restent à saisir.

export interface Loan {
  id: string;
  label: string;
  monthlyPaymentCents: Cents;
  annualRatePercent: number;
  endDate: IsoDate;
}

export interface Envelope {
  id: string;
  name: string;
  capCents: Cents;
}

export interface Settings {
  version: 1;
  /** Secret aléatoire (base64, 32 octets) pour les identifiants d'opérations. Fait partie du coffre. */
  idSecret: string;
  /** Clé de compte lue dans un fichier -> identifiant de compte interne. */
  accounts: { [accountKey: string]: string };
  monthlyIncomeCents: Cents;
  /** Jour du mois du versement du revenu (1 à 31). */
  payDay: number;
  overdraftLimitCents: Cents;
  overdraftRatePercent: number;
  loans: Loan[];
  /** Exactement trois enveloppes. */
  envelopes: Envelope[];
  /** Mots à ne jamais laisser sortir dans une analyse exportée (noms, rues, employeur…). */
  maskWords: string[];
}

export const DEFAULT_ENVELOPES: Array<{ id: string; name: string }> = [
  { id: 'obligatoire', name: 'Vie obligatoire' },
  { id: 'plaisir', name: 'Vie plaisir assumée' },
  { id: 'imprevus', name: 'Imprévus' },
];

export const MAX_MASK_WORDS = 50;
export const MIN_MASK_WORD_LENGTH = 2;

/** Saisie brute des formulaires : tout est du texte, validé à l'enregistrement. */
export interface LoanForm {
  id: string;
  label: string;
  payment: string;
  rate: string;
  endDate: string;
}
export interface EnvelopeForm {
  id: string;
  name: string;
  cap: string;
}
export interface SettingsForm {
  income: string;
  payDay: string;
  overdraftLimit: string;
  overdraftRate: string;
  loans: LoanForm[];
  envelopes: EnvelopeForm[];
  maskWords: string;
}

export interface FieldErrors {
  [field: string]: string;
}
export type SettingsResult = { ok: true; value: Settings } | { ok: false; errors: FieldErrors };

export function emptyForm(): SettingsForm {
  return {
    income: '',
    payDay: '',
    overdraftLimit: '',
    overdraftRate: '',
    loans: [],
    envelopes: DEFAULT_ENVELOPES.map((e) => ({ id: e.id, name: e.name, cap: '' })),
    maskWords: '',
  };
}

/** « 7,5 », « 7.5 », « 7,5 % » -> 7.5. Refuse hors de 0 à 100 ou plus de 3 décimales. */
export function parsePercent(input: string): number | null {
  const s = input.replace(/%/g, '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(s)) return null;
  const value = parseFloat(s);
  return value >= 0 && value <= 100 ? value : null;
}

function percentToInput(value: number): string {
  return String(value).replace('.', ',');
}

export function formFromSettings(s: Settings): SettingsForm {
  return {
    income: formatCentsPlain(s.monthlyIncomeCents),
    payDay: String(s.payDay),
    overdraftLimit: s.overdraftLimitCents === 0 ? '' : formatCentsPlain(s.overdraftLimitCents),
    overdraftRate: s.overdraftLimitCents === 0 ? '' : percentToInput(s.overdraftRatePercent),
    loans: s.loans.map((l) => ({
      id: l.id,
      label: l.label,
      payment: formatCentsPlain(l.monthlyPaymentCents),
      rate: percentToInput(l.annualRatePercent),
      endDate: l.endDate,
    })),
    envelopes: s.envelopes.map((e) => ({ id: e.id, name: e.name, cap: formatCentsPlain(e.capCents) })),
    maskWords: s.maskWords.join('\n'),
  };
}

/** Sépare les mots à masquer (un par ligne ou séparés par des virgules / points-virgules). */
export function splitMaskWords(text: string): string[] {
  const seen: { [lower: string]: boolean } = {};
  const out: string[] = [];
  text.split(/[\n,;]+/).forEach((raw) => {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (word.length > 0 && !seen[key]) {
      seen[key] = true;
      out.push(word);
    }
  });
  return out;
}

export interface SettingsBase {
  idSecret: string;
  accounts: { [accountKey: string]: string };
}

/** Valide le formulaire. `base` apporte le secret et les comptes, que le formulaire ne modifie jamais. */
export function settingsFromForm(form: SettingsForm, base: SettingsBase): SettingsResult {
  const errors: FieldErrors = {};

  const income = parseFrenchAmount(form.income);
  if (income === null || income < 0) errors.income = 'Indiquez un montant valide, par exemple 2 300,00.';

  const payDay = /^\d{1,2}$/.test(form.payDay.trim()) ? parseInt(form.payDay.trim(), 10) : NaN;
  if (!(payDay >= 1 && payDay <= 31)) errors.payDay = 'Indiquez un jour entre 1 et 31.';

  let overdraftLimit = 0;
  if (form.overdraftLimit.trim() !== '') {
    const parsed = parseFrenchAmount(form.overdraftLimit);
    if (parsed === null || parsed < 0) errors.overdraftLimit = 'Montant invalide. Laissez vide si vous n’avez pas de découvert autorisé.';
    else overdraftLimit = parsed;
  }
  let overdraftRate = 0;
  if (overdraftLimit > 0 || form.overdraftRate.trim() !== '') {
    const parsed = parsePercent(form.overdraftRate);
    if (parsed === null) errors.overdraftRate = 'Indiquez le taux annuel, par exemple 16,5 (entre 0 et 100).';
    else overdraftRate = parsed;
  }

  const loans: Loan[] = [];
  form.loans.forEach((l, i) => {
    const payment = parseFrenchAmount(l.payment);
    if (payment === null || payment <= 0) errors['loans.' + i + '.payment'] = 'Mensualité invalide.';
    const rate = parsePercent(l.rate);
    if (rate === null) errors['loans.' + i + '.rate'] = 'Taux invalide (entre 0 et 100).';
    if (!isIsoDate(l.endDate.trim())) errors['loans.' + i + '.endDate'] = 'Date invalide : écrivez AAAA-MM-JJ.';
    if (payment !== null && payment > 0 && rate !== null && isIsoDate(l.endDate.trim())) {
      loans.push({
        id: l.id,
        label: l.label.trim(),
        monthlyPaymentCents: payment,
        annualRatePercent: rate,
        endDate: l.endDate.trim(),
      });
    }
  });

  const envelopes: Envelope[] = [];
  const names: { [lower: string]: boolean } = {};
  form.envelopes.forEach((e, i) => {
    const name = e.name.trim();
    if (name === '') errors['envelopes.' + i + '.name'] = 'Donnez un nom à cette enveloppe.';
    else if (names[name.toLowerCase()]) errors['envelopes.' + i + '.name'] = 'Deux enveloppes ne peuvent pas avoir le même nom.';
    names[name.toLowerCase()] = true;
    const cap = parseFrenchAmount(e.cap);
    if (cap === null || cap < 0) errors['envelopes.' + i + '.cap'] = 'Indiquez un plafond mensuel (0 si aucun).';
    if (name !== '' && cap !== null && cap >= 0) envelopes.push({ id: e.id, name, capCents: cap });
  });
  if (form.envelopes.length !== 3) errors.envelopes = 'Il faut exactement trois enveloppes.';

  const maskWords = splitMaskWords(form.maskWords);
  if (maskWords.length > MAX_MASK_WORDS) errors.maskWords = 'Au plus ' + MAX_MASK_WORDS + ' mots.';
  if (maskWords.some((w) => w.length < MIN_MASK_WORD_LENGTH)) {
    errors.maskWords = 'Chaque mot doit avoir au moins ' + MIN_MASK_WORD_LENGTH + ' caractères.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      version: 1,
      idSecret: base.idSecret,
      accounts: base.accounts,
      monthlyIncomeCents: income as Cents,
      payDay,
      overdraftLimitCents: overdraftLimit,
      overdraftRatePercent: overdraftRate,
      loans,
      envelopes,
      maskWords,
    },
  };
}
