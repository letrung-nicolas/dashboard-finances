import { decryptBytes, encryptBytes } from './aes';
import { base64ToBytes, bytesToBase64 } from './encoding';
import { CryptoError } from './errors';
import {
  deriveKek,
  KDF_NAME,
  MAX_ITERATIONS,
  MIN_ACCEPTED_ITERATIONS,
  MIN_ITERATIONS,
  newSalt,
  SALT_BYTES,
} from './kdf';
import { randomBytes, subtle } from './webcrypto';

// Hiérarchie de clés :
//   mot de passe --PBKDF2(sel, itérations)--> KEK  (jamais stockée)
//   clé de données (DEK, aléatoire 256 bits) --chiffrée par la KEK--> wrappedKey (stockée)
// Les données sont chiffrées par la DEK. Changer de mot de passe ou d'itérations ne ré-encrypte
// donc que la DEK (quelques octets), jamais les données. wrappedKey sert aussi de VÉRIFICATEUR :
// un mauvais mot de passe fait échouer l'authentification AES-GCM.
export const VAULT_VERSION = 1;
export const MIN_PASSWORD_LENGTH = 12;
const DEK_BYTES = 32;

export interface VaultHeader {
  version: 1;
  kdf: typeof KDF_NAME;
  iterations: number;
  salt: string; // base64
  wrappedKey: string; // base64 (enveloppe AES-GCM de la DEK)
}

export interface UnlockedVault {
  header: VaultHeader;
  /** Clé de données, non extractable. */
  key: CryptoKey;
}

// Les paramètres de dérivation sont liés au chiffré : les altérer fait échouer le déchiffrement.
function headerAad(iterations: number, saltB64: string): string {
  return 'fin-vault/v' + VAULT_VERSION + '/' + KDF_NAME + '/' + iterations + '/' + saltB64;
}

function checkPassword(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new CryptoError(
      'WEAK_PASSWORD',
      'Le mot de passe doit contenir au moins ' + MIN_PASSWORD_LENGTH + ' caractères.',
    );
  }
}

function checkCreationIterations(iterations: number): void {
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new CryptoError(
      'WEAK_PARAMS',
      'Itérations PBKDF2 hors limites (' + MIN_ITERATIONS + ' à ' + MAX_ITERATIONS + ').',
    );
  }
}

/** Valide un en-tête lu depuis le disque ou une sauvegarde. Ne vérifie pas le mot de passe. */
export function parseVaultHeader(input: unknown): VaultHeader {
  const bad = (msg: string) => new CryptoError('INVALID_HEADER', 'En-tête de coffre invalide : ' + msg);
  if (typeof input !== 'object' || input === null) throw bad('objet attendu');
  const h = input as Record<string, unknown>;
  if (h.version !== VAULT_VERSION) throw bad('version inconnue');
  if (h.kdf !== KDF_NAME) throw bad('algorithme inconnu');
  const iterations = h.iterations;
  if (
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < MIN_ACCEPTED_ITERATIONS ||
    iterations > MAX_ITERATIONS
  ) {
    throw bad('itérations hors limites');
  }
  if (typeof h.salt !== 'string' || base64ToBytes(h.salt).length !== SALT_BYTES) throw bad('sel');
  if (typeof h.wrappedKey !== 'string' || base64ToBytes(h.wrappedKey).length < 1) throw bad('clé');
  return {
    version: VAULT_VERSION,
    kdf: KDF_NAME,
    iterations,
    salt: h.salt,
    wrappedKey: h.wrappedKey,
  };
}

async function wrap(password: string, dek: Uint8Array, iterations: number): Promise<VaultHeader> {
  const salt = newSalt();
  const saltB64 = bytesToBase64(salt);
  const kek = await deriveKek(password, salt, iterations);
  const wrapped = await encryptBytes(kek, dek, headerAad(iterations, saltB64));
  return {
    version: VAULT_VERSION,
    kdf: KDF_NAME,
    iterations,
    salt: saltB64,
    wrappedKey: bytesToBase64(wrapped),
  };
}

async function unwrapRaw(password: string, header: VaultHeader): Promise<Uint8Array> {
  const kek = await deriveKek(password, base64ToBytes(header.salt), header.iterations);
  try {
    return await decryptBytes(
      kek,
      base64ToBytes(header.wrappedKey),
      headerAad(header.iterations, header.salt),
    );
  } catch (e) {
    if (e instanceof CryptoError && e.code === 'CORRUPTED') {
      throw new CryptoError('WRONG_PASSWORD', 'Mot de passe incorrect (ou coffre altéré).');
    }
    throw e;
  }
}

function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Crée un coffre neuf : DEK aléatoire, protégée par le mot de passe. */
export async function createVault(
  password: string,
  iterations: number = MIN_ITERATIONS,
): Promise<UnlockedVault> {
  checkPassword(password);
  checkCreationIterations(iterations);
  const dek = randomBytes(DEK_BYTES);
  try {
    const header = await wrap(password, dek, iterations);
    return { header, key: await importDek(dek) };
  } finally {
    dek.fill(0);
  }
}

export async function unlockVault(password: string, headerInput: unknown): Promise<UnlockedVault> {
  const header = parseVaultHeader(headerInput);
  const dek = await unwrapRaw(password, header);
  try {
    return { header, key: await importDek(dek) };
  } finally {
    dek.fill(0);
  }
}

/**
 * Change le mot de passe et/ou le nombre d'itérations SANS toucher aux données déjà chiffrées
 * (la DEK reste la même). À stocker à la place de l'ancien en-tête.
 */
export async function rewrapVault(
  headerInput: unknown,
  oldPassword: string,
  newPassword: string,
  iterations: number = MIN_ITERATIONS,
): Promise<UnlockedVault> {
  const header = parseVaultHeader(headerInput);
  checkPassword(newPassword);
  checkCreationIterations(iterations);
  const dek = await unwrapRaw(oldPassword, header);
  try {
    const next = await wrap(newPassword, dek, iterations);
    return { header: next, key: await importDek(dek) };
  } finally {
    dek.fill(0);
  }
}

/** Vrai si le coffre a été créé avec moins d'itérations que le plancher actuel. */
export function needsIterationUpgrade(header: VaultHeader): boolean {
  return header.iterations < MIN_ITERATIONS;
}
