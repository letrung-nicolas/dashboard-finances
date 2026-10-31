import { base64ToBytes, bytesToBase64, parseVaultHeader } from '../crypto';
import type { VaultHeader } from '../crypto';
import { BACKUP_FORMAT_VERSION, StorageError } from './types';
import type { RawRecord } from './types';

// Fichier de sauvegarde : l'en-tête du coffre + les enregistrements DÉJÀ chiffrés.
// Il ne contient rien en clair d'utile : sans le mot de passe, il est illisible.
export interface BackupFile {
  format: 'dashboard-finances-backup';
  formatVersion: number;
  schemaVersion: number;
  createdAt: string;
  vault: VaultHeader;
  records: Array<{ k: string; d: string }>;
}

export interface ParsedBackup {
  schemaVersion: number;
  vault: VaultHeader;
  records: RawRecord[];
}

const bad = (message: string) => new StorageError('BACKUP_INVALID', message);

export function serializeBackup(
  vault: VaultHeader,
  schemaVersion: number,
  records: RawRecord[],
  createdAt: number,
): string {
  const file: BackupFile = {
    format: 'dashboard-finances-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion,
    createdAt: new Date(createdAt).toISOString(),
    vault,
    records: records.map((r) => ({ k: r.k, d: bytesToBase64(r.d) })),
  };
  return JSON.stringify(file);
}

/** Lit un fichier de sauvegarde. Les anciens formats seront migrés ici (une fonction par version). */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw bad("Ce fichier n'est pas une sauvegarde valide.");
  }
  if (typeof raw !== 'object' || raw === null) throw bad("Ce fichier n'est pas une sauvegarde valide.");
  const f = raw as Record<string, unknown>;
  if (f.format !== 'dashboard-finances-backup') throw bad("Ce fichier n'est pas une sauvegarde de cette application.");
  if (typeof f.formatVersion !== 'number' || !Number.isInteger(f.formatVersion) || f.formatVersion < 1) {
    throw bad('Version de sauvegarde illisible.');
  }
  if (f.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new StorageError(
      'BACKUP_UNSUPPORTED',
      "Cette sauvegarde vient d'une version plus récente de l'application. Mettez l'application à jour.",
    );
  }
  if (typeof f.schemaVersion !== 'number' || !Number.isInteger(f.schemaVersion) || f.schemaVersion < 1) {
    throw bad('Version des données illisible.');
  }
  if (!Array.isArray(f.records)) throw bad('Liste des enregistrements manquante.');
  const records: RawRecord[] = f.records.map((entry: unknown) => {
    const e = entry as { k?: unknown; d?: unknown };
    if (typeof e !== 'object' || e === null || typeof e.k !== 'string' || typeof e.d !== 'string') {
      throw bad('Enregistrement malformé.');
    }
    return { k: e.k, d: base64ToBytes(e.d) };
  });
  return { schemaVersion: f.schemaVersion, vault: parseVaultHeader(f.vault), records };
}

export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => (n < 10 ? '0' + n : String(n));
  return (
    'finances-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.sauvegarde.json'
  );
}
