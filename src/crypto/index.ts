export { decryptBytes, decryptJson, encryptBytes, encryptJson } from './aes';
export { base64ToBytes, bytesToBase64 } from './encoding';
export { CryptoError } from './errors';
export type { CryptoErrorCode } from './errors';
export { MIN_ITERATIONS, measureDerivationMs } from './kdf';
export {
  createVault,
  MIN_PASSWORD_LENGTH,
  needsIterationUpgrade,
  parseVaultHeader,
  rewrapVault,
  unlockVault,
} from './vault';
export type { UnlockedVault, VaultHeader } from './vault';
export { isCryptoAvailable } from './webcrypto';
export { hmacSha256Hex, sha256Hex } from './hash';
export { bytesToHex } from './encoding';
export { randomBytes } from './webcrypto';
