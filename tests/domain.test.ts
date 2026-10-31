import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatCents,
  isIsoDate,
  maskAccountNumber,
  monthKey,
  normalizeLabel,
  parseFrenchAmount,
  toIsoDate,
} from '../src/domain';

describe('montants', () => {
  it('lit les formats français en centimes entiers', () => {
    const cases: Array<[string, number]> = [
      ['1 546,53', 154653],
      ['1 546,53', 154653], // espace insécable
      ['1 546,53', 154653], // espace fine insécable (Intl récent)
      ['1.546,53', 154653],
      ['12,5', 1250],
      ['12,50', 1250],
      ['12', 1200],
      ['0,05', 5],
      ['-12,50', -1250],
      ['−12,50', -1250], // vrai signe moins
      ['12,50-', -1250], // signe à droite
      ['(12,50)', -1250], // parenthèses = négatif
      ['+1 000,00 €', 100000],
      ['1 546,53 EUR', 154653],
    ];
    for (const [text, cents] of cases) expect(parseFrenchAmount(text)).toBe(cents);
  });

  it('refuse ce qui est ambigu ou invalide plutôt que de deviner', () => {
    for (const text of ['', 'abc', '1,234', '1,2,3', '12,', ',50', '1 2 3', '--5', '12,50,00', '1.5.5']) {
      expect(parseFrenchAmount(text)).toBeNull();
    }
  });

  it('formate à la française, avec séparateur de milliers insécable', () => {
    expect(formatCents(154653)).toBe('1 546,53 €');
    expect(formatCents(5)).toBe('0,05 €');
    expect(formatCents(100000000)).toBe('1 000 000,00 €');
    expect(formatCents(-1250)).toBe('−12,50 €');
    expect(formatCents(1250, { sign: true })).toBe('+12,50 €');
    expect(formatCents(0, { sign: true })).toBe('0,00 €');
  });

  it('aller-retour : ce qu’on affiche se relit à l’identique', () => {
    for (const cents of [0, 1, 99, 100, 154653, -154653, 99999999, -5]) {
      expect(parseFrenchAmount(formatCents(cents))).toBe(cents);
    }
  });
});

describe('dates', () => {
  it('valide les dates ISO, y compris les jours impossibles', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
  });

  it('ajoute des jours à travers fins de mois, d’année et années bissextiles', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-31', 30)).toBe('2026-04-30');
  });

  it('compte les jours entre deux dates', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    expect(daysBetween('2027-01-02', '2026-12-30')).toBe(-3);
    expect(daysBetween('2026-05-05', '2026-05-05')).toBe(0);
  });

  it('construit et regroupe par mois', () => {
    expect(toIsoDate(2026, 3, 5)).toBe('2026-03-05');
    expect(() => toIsoDate(2026, 2, 30)).toThrow();
    expect(monthKey('2026-03-05')).toBe('2026-03');
    expect(() => monthKey('nimporte')).toThrow();
    expect(() => addDays('2026-02-30', 1)).toThrow();
  });
});

describe('libellés et masquage', () => {
  it('normalise : casse, accents composés, espaces insécables', () => {
    expect(normalizeLabel('  Carte  X1234 intermarché ')).toBe('CARTE X1234 INTERMARCHÉ');
    const decomposed = 'cafe' + String.fromCharCode(0x301);
    expect(normalizeLabel(decomposed)).toBe(normalizeLabel('caf' + String.fromCharCode(0xe9)));
  });

  it('masque un numéro de compte en gardant 4 caractères', () => {
    expect(maskAccountNumber('XX00 0000 1111 2222 3333 4444 555')).toBe('•••• 4555');
    expect(maskAccountNumber('12')).toBe('••••');
    expect(maskAccountNumber('XX00 0000 1111 2222 3333 4444 555')).not.toContain('1111');
  });
});
