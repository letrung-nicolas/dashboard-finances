import {
  CryptoError,
  createVault as createCryptoVault,
  decryptJson,
  encryptJson,
  parseVaultHeader,
  rewrapVault,
  unlockVault,
} from '../crypto';
import type { VaultHeader } from '../crypto';
import { parseBackup, serializeBackup } from './backup';
import { META, openDatabase, RECORDS, requestToPromise, scanRecords, transactionDone } from './idb';
import { MIGRATIONS, migrationPath } from './migrations';
import type { Migration, MigrationContext } from './migrations';
import { IDB_VERSION, SCHEMA_VERSION, StorageError } from './types';
import type { BackupState, RawRecord, RecordEntry } from './types';

const HEADER_KEY = 'vaultHeader';
const SCHEMA_KEY = 'schemaVersion';
const BACKUP_COLLECTION = 'backup';
const BACKUP_STATE_ID = 'state';

const COLLECTION_RE = /^[a-z][a-z0-9-]{0,31}$/;

export interface StoreOptions {
  schemaVersion?: number;
  migrations?: Migration[];
  now?: () => number;
}

function recordKey(collection: string, id: string): string {
  if (!COLLECTION_RE.test(collection)) {
    throw new StorageError('INVALID_KEY', 'Nom de collection invalide : ' + collection);
  }
  if (typeof id !== 'string' || id.length < 1 || id.length > 256) {
    throw new StorageError('INVALID_KEY', "Identifiant d'enregistrement invalide.");
  }
  return collection + '/' + id;
}

function emptyBackupState(): BackupState {
  return { lastBackupAt: null, changesSinceBackup: 0 };
}

/**
 * Stockage IndexedDB chiffré. Tout enregistrement est chiffré (AES-GCM) avec la clé du coffre ;
 * seuls le nom de collection et l'identifiant restent lisibles dans la clé, et l'identifiant
 * doit donc rester opaque (jamais un libellé ni un montant). Le chiffré est lié à sa clé
 * (données associées) : échanger deux enregistrements dans la base fait échouer le déchiffrement.
 */
export class EncryptedStore {
  private key: CryptoKey | null = null;
  private header: VaultHeader | null = null;
  private backupState: BackupState = emptyBackupState();
  private listeners: Array<() => void> = [];

  private constructor(
    private readonly db: IDBDatabase,
    private readonly schemaVersion: number,
    private readonly migrations: Migration[],
    private readonly now: () => number,
  ) {}

  static async open(dbName: string = 'finances', options: StoreOptions = {}): Promise<EncryptedStore> {
    const db = await openDatabase(dbName, IDB_VERSION);
    return new EncryptedStore(
      db,
      options.schemaVersion !== undefined ? options.schemaVersion : SCHEMA_VERSION,
      options.migrations !== undefined ? options.migrations : MIGRATIONS,
      options.now !== undefined ? options.now : Date.now,
    );
  }

  close(): void {
    this.lock();
    this.db.close();
  }

  // ---------- état ----------

  get isUnlocked(): boolean {
    return this.key !== null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.slice().forEach((l) => l());
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new StorageError('NOT_UNLOCKED', 'Le coffre est verrouillé.');
    return this.key;
  }

  getBackupState(): BackupState {
    return { lastBackupAt: this.backupState.lastBackupAt, changesSinceBackup: this.backupState.changesSinceBackup };
  }

  /** Itérations PBKDF2 du coffre courant (pour proposer un ajustement). */
  get iterations(): number | null {
    return this.header ? this.header.iterations : null;
  }

  // ---------- méta (en clair, non sensible) ----------

  private async readMeta<T>(name: string): Promise<T | undefined> {
    const tx = this.db.transaction(META, 'readonly');
    const value = await requestToPromise(tx.objectStore(META).get(name));
    return value as T | undefined;
  }

  async hasVault(): Promise<boolean> {
    return (await this.readMeta(HEADER_KEY)) !== undefined;
  }

  // ---------- cycle de vie du coffre ----------

  async createVault(password: string, iterations?: number): Promise<void> {
    if (await this.hasVault()) throw new StorageError('VAULT_EXISTS', 'Un coffre existe déjà.');
    const vault = await createCryptoVault(password, iterations);
    const tx = this.db.transaction(META, 'readwrite');
    tx.objectStore(META).put(vault.header, HEADER_KEY);
    tx.objectStore(META).put(this.schemaVersion, SCHEMA_KEY);
    await transactionDone(tx);
    this.key = vault.key;
    this.header = vault.header;
    this.backupState = emptyBackupState();
    this.notify();
  }

  async unlock(password: string): Promise<void> {
    const stored = await this.readMeta<unknown>(HEADER_KEY);
    if (stored === undefined) throw new StorageError('NO_VAULT', "Aucun coffre n'existe sur cet appareil.");
    const storedVersion = (await this.readMeta<number>(SCHEMA_KEY)) || 1;
    if (storedVersion > this.schemaVersion) {
      throw new StorageError(
        'UNSUPPORTED_DATA_VERSION',
        "Ces données ont été créées par une version plus récente de l'application.",
      );
    }
    const vault = await unlockVault(password, stored);
    this.key = vault.key;
    this.header = vault.header;
    try {
      if (storedVersion < this.schemaVersion) await this.migrate(storedVersion);
      this.backupState = await this.loadBackupState();
    } catch (e) {
      this.key = null;
      this.header = null;
      throw e;
    }
    this.notify();
  }

  lock(): void {
    this.key = null;
    this.header = null;
    this.backupState = emptyBackupState();
    this.notify();
  }

  /** Change le mot de passe et/ou les itérations sans ré-encrypter les données (voir docs/crypto.md). */
  async changePassword(oldPassword: string, newPassword: string, iterations?: number): Promise<void> {
    this.requireKey();
    const current = await this.readMeta<unknown>(HEADER_KEY);
    const next = await rewrapVault(current, oldPassword, newPassword, iterations);
    const tx = this.db.transaction(META, 'readwrite');
    tx.objectStore(META).put(next.header, HEADER_KEY);
    await transactionDone(tx);
    this.key = next.key;
    this.header = next.header;
    this.notify();
  }

  // ---------- enregistrements ----------

  async put(collection: string, id: string, value: unknown): Promise<void> {
    await this.putMany(collection, [{ id, value }]);
  }

  /** Écrit plusieurs enregistrements dans UNE transaction (tout ou rien). */
  async putMany(collection: string, items: Array<{ id: string; value: unknown }>): Promise<void> {
    const key = this.requireKey();
    const sealed: RawRecord[] = [];
    for (const item of items) {
      const k = recordKey(collection, item.id);
      sealed.push({ k, d: await encryptJson(key, item.value, k) });
    }
    const tx = this.db.transaction(RECORDS, 'readwrite');
    sealed.forEach((r) => tx.objectStore(RECORDS).put(r.d, r.k));
    await transactionDone(tx);
    await this.trackChanges(collection, items.length);
  }

  async get<T>(collection: string, id: string): Promise<T | undefined> {
    const key = this.requireKey();
    const k = recordKey(collection, id);
    const tx = this.db.transaction(RECORDS, 'readonly');
    const raw = await requestToPromise(tx.objectStore(RECORDS).get(k));
    if (raw === undefined) return undefined;
    return decryptJson<T>(key, raw instanceof Uint8Array ? raw : new Uint8Array(raw), k);
  }

  async getAll<T>(collection: string): Promise<Array<RecordEntry<T>>> {
    const key = this.requireKey();
    recordKey(collection, 'x'); // valide le nom de collection
    const prefix = collection + '/';
    const raws = await scanRecords(this.db, IDBKeyRange.bound(prefix, prefix + '￿'));
    const out: Array<RecordEntry<T>> = [];
    for (const r of raws) {
      out.push({ id: r.k.slice(prefix.length), value: await decryptJson<T>(key, r.d, r.k) });
    }
    return out;
  }

  /** Nombre d'enregistrements, sans déchiffrer. */
  async count(collection: string): Promise<number> {
    this.requireKey();
    recordKey(collection, 'x');
    const prefix = collection + '/';
    const tx = this.db.transaction(RECORDS, 'readonly');
    return requestToPromise(
      tx.objectStore(RECORDS).count(IDBKeyRange.bound(prefix, prefix + '￿')),
    );
  }

  async remove(collection: string, id: string): Promise<void> {
    this.requireKey();
    const k = recordKey(collection, id);
    const tx = this.db.transaction(RECORDS, 'readwrite');
    tx.objectStore(RECORDS).delete(k);
    await transactionDone(tx);
    await this.trackChanges(collection, 1);
  }

  /** Efface TOUT (enregistrements, coffre, version). Irréversible. */
  async wipe(): Promise<void> {
    const tx = this.db.transaction([META, RECORDS], 'readwrite');
    tx.objectStore(META).clear();
    tx.objectStore(RECORDS).clear();
    await transactionDone(tx);
    this.lock();
  }

  // ---------- suivi de sauvegarde ----------

  private async loadBackupState(): Promise<BackupState> {
    const state = await this.get<BackupState>(BACKUP_COLLECTION, BACKUP_STATE_ID);
    return state ? { lastBackupAt: state.lastBackupAt, changesSinceBackup: state.changesSinceBackup } : emptyBackupState();
  }

  private async saveBackupState(): Promise<void> {
    const key = this.requireKey();
    const k = recordKey(BACKUP_COLLECTION, BACKUP_STATE_ID);
    const sealed = await encryptJson(key, this.backupState, k);
    const tx = this.db.transaction(RECORDS, 'readwrite');
    tx.objectStore(RECORDS).put(sealed, k);
    await transactionDone(tx);
  }

  private async trackChanges(collection: string, count: number): Promise<void> {
    if (collection === BACKUP_COLLECTION) return;
    this.backupState = {
      lastBackupAt: this.backupState.lastBackupAt,
      changesSinceBackup: this.backupState.changesSinceBackup + count,
    };
    await this.saveBackupState();
    this.notify();
  }

  // ---------- sauvegarde / restauration ----------

  private async dumpRaw(): Promise<RawRecord[]> {
    return scanRecords(this.db);
  }

  /** Produit le texte du fichier de sauvegarde (chiffré) et remet le compteur de modifications à zéro. */
  async exportBackup(): Promise<string> {
    this.requireKey();
    const header = parseVaultHeader(await this.readMeta<unknown>(HEADER_KEY));
    const schemaVersion = (await this.readMeta<number>(SCHEMA_KEY)) || 1;
    const records = (await this.dumpRaw()).filter((r) => r.k.indexOf(BACKUP_COLLECTION + '/') !== 0);
    const at = this.now();
    const text = serializeBackup(header, schemaVersion, records, at);
    this.backupState = { lastBackupAt: at, changesSinceBackup: 0 };
    await this.saveBackupState();
    this.notify();
    return text;
  }

  /**
   * Remplace TOUT le contenu local par la sauvegarde, après avoir vérifié le mot de passe et
   * l'intégrité de CHAQUE enregistrement. Rien n'est écrit si une vérification échoue.
   * Le coffre reste verrouillé : l'appelant déverrouille ensuite avec le mot de passe de la sauvegarde.
   */
  async restoreBackup(text: string, password: string): Promise<void> {
    const backup = parseBackup(text);
    if (backup.schemaVersion > this.schemaVersion) {
      throw new StorageError(
        'BACKUP_UNSUPPORTED',
        "Cette sauvegarde contient des données d'une version plus récente de l'application.",
      );
    }
    const vault = await unlockVault(password, backup.vault);
    for (const r of backup.records) {
      try {
        await decryptJson(vault.key, r.d, r.k);
      } catch (e) {
        if (e instanceof CryptoError) {
          throw new StorageError('BACKUP_INVALID', 'Sauvegarde altérée : un enregistrement est illisible.');
        }
        throw e;
      }
    }
    const tx = this.db.transaction([META, RECORDS], 'readwrite');
    tx.objectStore(RECORDS).clear();
    backup.records.forEach((r) => tx.objectStore(RECORDS).put(r.d, r.k));
    tx.objectStore(META).put(backup.vault, HEADER_KEY);
    tx.objectStore(META).put(backup.schemaVersion, SCHEMA_KEY);
    await transactionDone(tx);
    this.lock();
  }

  // ---------- migrations ----------

  private async migrate(from: number): Promise<void> {
    const path = migrationPath(this.migrations, from, this.schemaVersion);
    if (!path) {
      throw new StorageError(
        'MIGRATION_FAILED',
        'Aucune migration disponible de la version ' + from + ' à ' + this.schemaVersion + '.',
      );
    }
    // Instantané des enregistrements chiffrés : restauré tel quel si une migration échoue.
    const snapshot = await this.dumpRaw();
    const ctx: MigrationContext = {
      getAll: (c) => this.getAll(c),
      put: (c, id, v) => this.put(c, id, v),
      remove: (c, id) => this.remove(c, id),
    };
    try {
      for (const step of path) await step.run(ctx);
      const tx = this.db.transaction(META, 'readwrite');
      tx.objectStore(META).put(this.schemaVersion, SCHEMA_KEY);
      await transactionDone(tx);
    } catch {
      const rollback = this.db.transaction(RECORDS, 'readwrite');
      rollback.objectStore(RECORDS).clear();
      snapshot.forEach((r) => rollback.objectStore(RECORDS).put(r.d, r.k));
      await transactionDone(rollback);
      throw new StorageError('MIGRATION_FAILED', 'La mise à jour des données a échoué ; vos données sont intactes.');
    }
  }
}
