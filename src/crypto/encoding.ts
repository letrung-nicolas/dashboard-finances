import { CryptoError } from './errors';

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const CHUNK = 0x8000; // évite de dépasser la pile avec String.fromCharCode.apply

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = Array.prototype.slice.call(bytes.subarray(i, i + CHUNK)) as number[];
    binary += String.fromCharCode.apply(null, part);
  }
  return btoa(binary);
}

const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function base64ToBytes(base64: string): Uint8Array {
  // atob est tolérant (espaces, etc.) : on exige un base64 strict.
  if (typeof base64 !== 'string' || !BASE64_RE.test(base64)) {
    throw new CryptoError('INVALID_HEADER', 'Base64 invalide');
  }
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
