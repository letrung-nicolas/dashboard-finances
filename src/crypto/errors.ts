export type CryptoErrorCode =
  | 'UNAVAILABLE' // WebCrypto absent (page non servie en HTTPS, navigateur trop ancien)
  | 'WRONG_PASSWORD' // mot de passe incorrect, ou en-tête altéré (indiscernable par construction)
  | 'CORRUPTED' // données chiffrées altérées, tronquées ou de version inconnue
  | 'INVALID_HEADER' // en-tête de coffre malformé
  | 'WEAK_PASSWORD'
  | 'WEAK_PARAMS';

export class CryptoError extends Error {
  readonly code: CryptoErrorCode;

  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
    Object.setPrototypeOf(this, CryptoError.prototype);
  }
}
