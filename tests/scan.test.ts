import { describe, expect, it } from 'vitest';
import { ALLOW_MARKER, forbiddenDataFile, luhnValid, mod97, scanText } from '../scripts/scan-lib';

// Les valeurs « réelles » sont fabriquées à l'exécution : aucun IBAN ni numéro de carte valide
// n'est écrit en dur dans le dépôt (sinon le scan se bloquerait lui-même).
function makeValidFrIban(bban: string): string {
  const converted = bban
    .split('')
    .map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c))
    .join('');
  // FR = 15 27, puis « 00 » à la place de la clé.
  const check = 98 - mod97(converted + '152700');
  return 'FR' + (check < 10 ? '0' : '') + check + bban;
}

function makeLuhnNumber(prefix: string, length: number): string {
  let body = prefix;
  while (body.length < length - 1) body += String((body.length * 7 + 3) % 10);
  for (let d = 0; d < 10; d++) {
    if (luhnValid(body + d)) return body + d;
  }
  throw new Error('inatteignable');
}

const grouped = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim();

describe('scan anti-données personnelles', () => {
  const bban = '12345678901234567890123'.slice(0, 23);
  const valid = makeValidFrIban(bban);

  it('détecte un IBAN FR valide, compact ou groupé', () => {
    expect(scanText(`iban ${valid}`)).toEqual([{ kind: 'iban', line: 1 }]);
    expect(scanText(`iban ${grouped(valid)}`)).toEqual([{ kind: 'iban', line: 1 }]);
  });

  it('ignore un faux IBAN à clé invalide et un IBAN masqué', () => {
    const wrongCheck = valid.slice(0, 2) + (valid.slice(2, 4) === '99' ? '98' : '99') + valid.slice(4);
    expect(scanText(wrongCheck)).toEqual([]);
    expect(scanText('FR76 **** **** **** **** **** 123')).toEqual([]);
  });

  it('détecte un numéro de carte valide (Luhn), avec ou sans espaces', () => {
    const card = makeLuhnNumber('4', 16);
    expect(scanText(`carte ${card}`)).toEqual([{ kind: 'carte', line: 1 }]);
    expect(scanText(`carte ${card.replace(/(.{4})/g, '$1 ').trim()}`)).toEqual([
      { kind: 'carte', line: 1 },
    ]);
  });

  it('ignore un nombre long qui échoue à Luhn', () => {
    const card = makeLuhnNumber('4', 16);
    const last = Number(card.slice(-1));
    const broken = card.slice(0, -1) + ((last + 1) % 10);
    expect(scanText(broken)).toEqual([]);
  });

  it('détecte un e-mail réel mais autorise les domaines fictifs et noreply', () => {
    expect(scanText('contact: jean.dupont' + '@' + 'gmail.com')).toEqual([{ kind: 'email', line: 1 }]);
    expect(scanText('a' + '@' + 'example.org')).toEqual([]);
    expect(scanText('noreply' + '@' + 'anthropic.com')).toEqual([]);
    expect(scanText('123+x' + '@' + 'users.noreply.github.com')).toEqual([]);
  });

  it('numérote les lignes et respecte le marqueur scan:allow', () => {
    const text = ['ok', `x ${valid}`, `y ${valid} // ${ALLOW_MARKER}`].join('\n');
    expect(scanText(text)).toEqual([{ kind: 'iban', line: 2 }]);
  });

  it('interdit les fichiers de données hors fixtures, et tout PDF/Excel', () => {
    expect(forbiddenDataFile('releve.pdf')).toBe(true);
    expect(forbiddenDataFile('fixtures/releve.pdf')).toBe(true);
    expect(forbiddenDataFile('fixtures/exemple.xlsx')).toBe(true);
    expect(forbiddenDataFile('docs/export.csv')).toBe(true);
    expect(forbiddenDataFile('fixtures/inventé.csv')).toBe(false);
    expect(forbiddenDataFile('src/app/App.tsx')).toBe(false);
  });
});
