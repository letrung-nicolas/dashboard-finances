import { utf8Decode, utf8Encode } from './encoding';
import { CryptoError } from './errors';
import { randomBytes, subtle } from './webcrypto';

// Enveloppe : [ version (1 octet) | IV (12 octets) | texte chiffré + tag GCM (16 octets) ].
// Un IV neuf est tiré à CHAQUE chiffrement : réutiliser un IV avec la même clé casse AES-GCM.
export const ENVELOPE_VERSION = 1;
export const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 1 + IV_BYTES;

function params(iv: Uint8Array, aad?: string): AesGcmParams {
  const p: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource, tagLength: TAG_BYTES * 8 };
  // Les données associées (AAD) lient le chiffré à son contexte (ex. identifiant d'enregistrement).
  if (aad !== undefined) p.additionalData = utf8Encode(aad) as BufferSource;
  return p;
}

export async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: string,
): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const sealed = new Uint8Array(
    await subtle().encrypt(params(iv, aad), key, plaintext as BufferSource),
  );
  const out = new Uint8Array(HEADER_BYTES + sealed.length);
  out[0] = ENVELOPE_VERSION;
  out.set(iv, 1);
  out.set(sealed, HEADER_BYTES);
  return out;
}

export async function decryptBytes(
  key: CryptoKey,
  envelope: Uint8Array,
  aad?: string,
): Promise<Uint8Array> {
  if (envelope.length < HEADER_BYTES + TAG_BYTES) {
    throw new CryptoError('CORRUPTED', 'Données chiffrées tronquées.');
  }
  if (envelope[0] !== ENVELOPE_VERSION) {
    throw new CryptoError('CORRUPTED', 'Version de chiffrement inconnue.');
  }
  const iv = envelope.subarray(1, HEADER_BYTES);
  const sealed = envelope.subarray(HEADER_BYTES);
  try {
    return new Uint8Array(
      await subtle().decrypt(params(iv, aad), key, sealed as BufferSource),
    );
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('CORRUPTED', 'Déchiffrement impossible (clé, contexte ou données invalides).');
  }
}

export async function encryptJson(key: CryptoKey, value: unknown, aad?: string): Promise<Uint8Array> {
  return encryptBytes(key, utf8Encode(JSON.stringify(value)), aad);
}

export async function decryptJson<T>(key: CryptoKey, envelope: Uint8Array, aad?: string): Promise<T> {
  const bytes = await decryptBytes(key, envelope, aad);
  return JSON.parse(utf8Decode(bytes)) as T;
}
