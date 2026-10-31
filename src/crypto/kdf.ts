import { utf8Encode } from './encoding';
import { randomBytes, subtle } from './webcrypto';

export const KDF_NAME = 'PBKDF2-SHA256';
/** Plancher à la CRÉATION. Les coffres existants s'ouvrent avec le nombre d'itérations qu'ils stockent. */
export const MIN_ITERATIONS = 600000;
/** Plafond de cohérence : un en-tête altéré ne doit pas pouvoir geler l'appareil. */
export const MAX_ITERATIONS = 10000000;
/** Plancher de lecture : en dessous, l'en-tête est considéré comme invalide. */
export const MIN_ACCEPTED_ITERATIONS = 100000;
export const SALT_BYTES = 16;

/**
 * Les claviers Mac et téléphone ne produisent pas toujours la même forme Unicode d'un caractère
 * accentué (« é » en un ou deux points de code). Sans normalisation, le même mot de passe saisi
 * sur deux appareils donnerait deux clés différentes.
 */
export function normalizePassword(password: string): string {
  return password.normalize('NFC');
}

export function newSalt(): Uint8Array {
  return randomBytes(SALT_BYTES);
}

/** Clé de chiffrement de clé (KEK) : non extractable, dérivée du mot de passe. */
export async function deriveKek(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const base = await subtle().importKey(
    'raw',
    utf8Encode(normalizePassword(password)) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

/** Durée (ms) d'une dérivation sur CET appareil, pour calibrer le nombre d'itérations. */
export async function measureDerivationMs(iterations: number = MIN_ITERATIONS): Promise<number> {
  const start = now();
  await deriveKek('mesure-de-vitesse', newSalt(), iterations);
  return now() - start;
}
