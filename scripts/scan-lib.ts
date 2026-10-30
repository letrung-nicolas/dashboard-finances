// Détection de données personnelles dans un dépôt PUBLIC.
// Logique pure (sans accès fichier) pour être testable. Ne jamais afficher la valeur trouvée :
// les journaux de CI d'un dépôt public sont publics.

export type FindingKind = 'iban' | 'carte' | 'email' | 'fichier-donnees';

export interface Finding {
  kind: FindingKind;
  line: number;
}

/** Une ligne contenant ce marqueur est ignorée (à justifier en revue). */
export const ALLOW_MARKER = 'scan:allow';

/** Reste de la division par 97 d'une chaîne numérique (calcul itératif, sans BigInt). */
export function mod97(digits: string): number {
  let rest = 0;
  for (let i = 0; i < digits.length; i++) {
    rest = (rest * 10 + (digits.charCodeAt(i) - 48)) % 97;
  }
  return rest;
}

function ibanToDigits(iban: string): string {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let out = '';
  for (let i = 0; i < rearranged.length; i++) {
    const c = rearranged.charAt(i);
    out += c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c;
  }
  return out;
}

/** IBAN FR dont la clé de contrôle (mod 97) est valide. Les faux IBAN de test sont invalides. */
export function isValidFrIban(candidate: string): boolean {
  const iban = candidate.replace(/[\s.\u00a0\u202f-]/g, '').toUpperCase();
  return /^FR\d{2}[0-9A-Z]{23}$/.test(iban) && mod97(ibanToDigits(iban)) === 1;
}

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const IBAN_RE = /\bFR\d{2}(?:[ .\u00a0\u202f-]?[0-9A-Za-z]){23}\b/gi;
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net', 'anthropic.com'];

function emailAllowed(domain: string): boolean {
  const d = domain.toLowerCase();
  if (d === 'users.noreply.github.com' || d.endsWith('.invalid') || d.endsWith('.test')) return true;
  return ALLOWED_EMAIL_DOMAINS.indexOf(d) !== -1;
}

export function scanText(text: string): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.indexOf(ALLOW_MARKER) !== -1) return;
    const n = index + 1;

    for (const m of line.match(IBAN_RE) || []) {
      if (isValidFrIban(m)) findings.push({ kind: 'iban', line: n });
    }
    for (const m of line.match(CARD_RE) || []) {
      const digits = m.replace(/[ -]/g, '');
      if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
        findings.push({ kind: 'carte', line: n });
      }
    }
    EMAIL_RE.lastIndex = 0;
    let em = EMAIL_RE.exec(line);
    while (em) {
      if (!emailAllowed(em[1])) findings.push({ kind: 'email', line: n });
      em = EMAIL_RE.exec(line);
    }
  });
  return findings;
}

const FORBIDDEN_ALWAYS = /\.(pdf|xls|xlsx|xlsm|mt940|sta|qfx|xml|zip)$/i;
const FORBIDDEN_OUTSIDE_FIXTURES = /\.(csv|ofx|qif)$/i;

/** Un fichier de données bancaires n'a sa place que dans fixtures/ (et jamais en PDF/Excel). */
export function forbiddenDataFile(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  if (p === 'package-lock.json') return false;
  if (FORBIDDEN_ALWAYS.test(p)) return true;
  return FORBIDDEN_OUTSIDE_FIXTURES.test(p) && p.indexOf('fixtures/') !== 0;
}
