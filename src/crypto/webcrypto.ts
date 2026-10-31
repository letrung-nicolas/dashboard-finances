import { CryptoError } from './errors';

/** WebCrypto exige un contexte sécurisé (HTTPS ou localhost). */
export function isCryptoAvailable(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  );
}

export function subtle(): SubtleCrypto {
  if (!isCryptoAvailable()) {
    throw new CryptoError(
      'UNAVAILABLE',
      "Le chiffrement n'est pas disponible dans ce navigateur (HTTPS requis).",
    );
  }
  return globalThis.crypto.subtle;
}

export function randomBytes(length: number): Uint8Array {
  if (!isCryptoAvailable()) {
    throw new CryptoError('UNAVAILABLE', "Générateur aléatoire indisponible.");
  }
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}
