import type { AccountBalance, NormalizedTransaction, ParseResult } from '../domain';

/**
 * Interface commune à toute source de données. Le tableau de bord ne consomme QUE
 * `NormalizedTransaction`. Seuls les connecteurs « fichier » existent pour l'instant.
 */
export interface Connector {
  id: string;
  name: string;
  authenticate?(): Promise<void>;
  fetchTransactions(since?: string): Promise<NormalizedTransaction[]>;
  fetchBalances?(): Promise<AccountBalance[]>;
}

/** Fourni par l'application au démarrage d'un import. */
export interface ConnectorContext {
  /** Secret aléatoire du coffre (32 octets) : rend les identifiants d'opérations indevinables. */
  idSecret: Uint8Array;
  /** Transforme la clé de compte d'un fichier en identifiant de compte (créé s'il est nouveau). */
  resolveAccountId(accountKey: string): string | Promise<string>;
}

/** Analyseur d'un format de fichier (PDF CA, CSV, OFX…). Pur : aucun accès réseau ni stockage. */
export interface FileParser {
  id: string;
  name: string;
  /** Libellé du format, ex. « pdf-ca », « csv », « ofx ». */
  format: string;
  parse(input: { name: string; bytes: Uint8Array }): Promise<ParseResult>;
}

/** Résumé d'un fichier ajouté, à afficher à l'utilisateur. */
export interface FileImportReport {
  fileHash: string;
  fileName: string;
  transactionCount: number;
  verification: ParseResult['verification'];
  bankTerms: ParseResult['bankTerms'];
  warnings: string[];
}
