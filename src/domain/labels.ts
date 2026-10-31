/**
 * Forme canonique d'un libellé bancaire pour comparer deux opérations : Unicode NFC, majuscules,
 * espaces (y compris insécables) réduits à un seul. Sert aux empreintes, jamais à l'affichage.
 */
export function normalizeLabel(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\s\u00a0\u202f]+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Masque un IBAN ou un numéro de compte en ne gardant que les 4 derniers caractères. */
export function maskAccountNumber(value: string): string {
  const compact = value.replace(/[\s.\u00a0\u202f-]/g, '');
  if (compact.length <= 4) return '\u2022\u2022\u2022\u2022';
  return '\u2022\u2022\u2022\u2022 ' + compact.slice(-4);
}
