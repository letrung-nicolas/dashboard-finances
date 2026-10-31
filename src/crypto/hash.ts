import { bytesToHex } from './encoding';
import { subtle } from './webcrypto';

/** Empreinte SHA-256 (hexadécimal) : identité d'un fichier importé. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await subtle().digest('SHA-256', bytes as BufferSource)));
}

/**
 * HMAC-SHA256 (hexadécimal). Sert à fabriquer des identifiants d'enregistrement stables mais
 * impossibles à deviner sans le secret du coffre (les identifiants sont lisibles sur le disque).
 */
export async function hmacSha256Hex(secret: Uint8Array, message: string): Promise<string> {
  const key = await subtle().importKey(
    'raw',
    secret as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = new TextEncoder().encode(message);
  return bytesToHex(new Uint8Array(await subtle().sign('HMAC', key, data as BufferSource)));
}
