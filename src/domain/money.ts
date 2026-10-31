import type { Cents } from './types';

const NBSP = '\u00a0';
const NARROW_NBSP = '\u202f';
const MINUS = '\u2212';

/**
 * Lit un montant au format français (« 1 546,53 », « -12,5 », « 1.546,53 € ») en centimes entiers.
 * Renvoie null si le texte n'est pas un montant sans ambiguïté (3 décimales, deux virgules, etc.).
 */
export function parseFrenchAmount(input: string): Cents | null {
  let s = input
    .replace(/[\u20ac]|EUR/gi, '')
    .split(NBSP).join(' ')
    .split(NARROW_NBSP).join(' ')
    .split(MINUS).join('-')
    .trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.charAt(0) === '-') {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.charAt(0) === '+') {
    s = s.slice(1).trim();
  }
  if (s.charAt(s.length - 1) === '-') {
    negative = !negative;
    s = s.slice(0, -1).trim();
  }
  const m = /^(\d{1,3}(?:[ .]\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const euros = parseInt(m[1].replace(/[ .]/g, ''), 10);
  const decimals = m[2] === undefined ? 0 : parseInt((m[2] + '0').slice(0, 2), 10);
  const cents = euros * 100 + decimals;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Affichage français d'un montant : « 1 546,53 € » (espace insécable comme séparateur de milliers). */
export function formatCents(cents: Cents, options: { sign?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const dec = abs % 100;
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const body = grouped + ',' + (dec < 10 ? '0' + dec : String(dec)) + NBSP + '\u20ac';
  if (cents < 0) return MINUS + body;
  return options.sign && cents > 0 ? '+' + body : body;
}

/** Arrondi à l'entier le plus proche, jamais de flottant qui fuit (ex. pourcentages). */
export function roundCents(value: number): Cents {
  return Math.round(value);
}

/** Montant pour un champ de saisie : « 2500,00 » (virgule, sans séparateur de milliers). */
export function formatCentsPlain(cents: Cents): string {
  const abs = Math.abs(cents);
  const dec = abs % 100;
  return (cents < 0 ? '-' : '') + Math.floor(abs / 100) + ',' + (dec < 10 ? '0' + dec : String(dec));
}
