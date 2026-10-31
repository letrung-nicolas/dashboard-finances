import type { RecordEntry } from './types';

/** Accès déchiffré aux enregistrements pendant une migration. */
export interface MigrationContext {
  getAll<T>(collection: string): Promise<Array<RecordEntry<T>>>;
  put(collection: string, id: string, value: unknown): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
}

export interface Migration {
  from: number;
  to: number;
  run(ctx: MigrationContext): Promise<void>;
}

/**
 * Migrations des données, de la plus ancienne à la plus récente. Vide tant que le schéma est en
 * version 1. Règle : ajouter une migration + un test + une sauvegarde figée de l'ancienne version.
 */
export const MIGRATIONS: Migration[] = [];

/** Chaîne de migrations de `from` à `to`, ou null si le chemin est incomplet. */
export function migrationPath(
  migrations: Migration[],
  from: number,
  to: number,
): Migration[] | null {
  const path: Migration[] = [];
  let version = from;
  while (version < to) {
    const next = migrations.filter((m) => m.from === version)[0];
    if (!next || next.to <= version) return null;
    path.push(next);
    version = next.to;
  }
  return version === to ? path : null;
}
