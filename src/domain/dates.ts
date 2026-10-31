import type { IsoDate } from './types';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

export function isIsoDate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  const pad = (n: number, len: number) => {
    let s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  };
  const iso = pad(year, 4) + '-' + pad(month, 2) + '-' + pad(day, 2);
  if (!isIsoDate(iso)) throw new Error('Date invalide : ' + iso);
  return iso;
}

function toUtc(iso: IsoDate): number {
  if (!isIsoDate(iso)) throw new Error('Date invalide : ' + iso);
  const m = ISO_RE.exec(iso) as RegExpExecArray;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const t = new Date(toUtc(iso) + days * DAY_MS);
  return toIsoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Nombre de jours de `a` à `b` (positif si b est après a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** `AAAA-MM`, clé de regroupement mensuel. */
export function monthKey(iso: IsoDate): string {
  if (!isIsoDate(iso)) throw new Error('Date invalide : ' + iso);
  return iso.slice(0, 7);
}
