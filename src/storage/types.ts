/** Version du SCHÉMA DES DONNÉES (contenu des enregistrements). Toute évolution = migration + test. */
export const SCHEMA_VERSION = 1;
/** Version de la STRUCTURE IndexedDB (magasins d'objets). */
export const IDB_VERSION = 1;
/** Version du FORMAT du fichier de sauvegarde. */
export const BACKUP_FORMAT_VERSION = 1;

export type StorageErrorCode =
  | 'IDB_UNAVAILABLE'
  | 'NOT_UNLOCKED'
  | 'NO_VAULT'
  | 'VAULT_EXISTS'
  | 'UNSUPPORTED_DATA_VERSION' // données créées par une version plus récente de l'appli
  | 'MIGRATION_FAILED'
  | 'BACKUP_INVALID'
  | 'BACKUP_UNSUPPORTED'
  | 'INVALID_KEY';

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

/** Suivi pour le rappel « Sauvegarder maintenant ». Stocké chiffré. */
export interface BackupState {
  lastBackupAt: number | null;
  changesSinceBackup: number;
}

export interface RecordEntry<T> {
  id: string;
  value: T;
}

/** Enregistrement tel que stocké : clé « collection/id » et enveloppe chiffrée. */
export interface RawRecord {
  k: string;
  d: Uint8Array;
}
