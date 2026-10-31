/** Montant en centimes d'euro, entier signé (entrée > 0, sortie < 0). Jamais de flottant pour l'argent. */
export type Cents = number;

/** Date au format ISO `AAAA-MM-JJ`. */
export type IsoDate = string;

/** D'où vient une opération (fichier importé). Stocké chiffré ; à exclure de toute analyse exportée. */
export interface SourceInfo {
  connectorId: string;
  format: string;
  fileHash: string;
  fileName: string;
}

/**
 * Opération telle que lue par un analyseur de fichier, avant attribution de l'identifiant.
 * L'ORDRE du tableau est celui du fichier : il sert à distinguer deux opérations identiques.
 */
export interface TransactionDraft {
  /** Clé du compte telle que le fichier la donne (ex. 4 derniers chiffres). Jamais un IBAN complet. */
  accountKey: string;
  date: IsoDate;
  valueDate?: IsoDate;
  amountCents: Cents;
  rawLabel: string;
}

/** Format unique consommé par le tableau de bord. Tout connecteur renvoie ceci. */
export interface NormalizedTransaction {
  id: string;
  accountId: string;
  date: IsoDate;
  valueDate?: IsoDate;
  amountCents: Cents;
  rawLabel: string;
  source: SourceInfo;
}

export interface AccountBalance {
  accountId: string;
  date: IsoDate;
  balanceCents: Cents;
  kind: 'statement-opening' | 'statement-closing' | 'reported';
}

/** Résultat du contrôle de solde d'un fichier. `not-verified` = « solde non vérifié » à l'affichage. */
export interface BalanceVerification {
  status: 'verified' | 'not-verified' | 'mismatch';
  expectedCents?: Cents;
  actualCents?: Cents;
  message?: string;
}

/** Conditions bancaires lues dans un relevé (proposées à l'utilisateur, jamais écrites dans le code). */
export interface BankTerms {
  overdraftLimitCents?: Cents;
  debitRatePercent?: number;
  taegPercent?: number;
}

export interface ParseResult {
  drafts: TransactionDraft[];
  /** Soldes lus dans le fichier ; `accountKey` est résolu en identifiant de compte par le connecteur. */
  balances: Array<{
    accountKey: string;
    date: IsoDate;
    balanceCents: Cents;
    kind: AccountBalance['kind'];
  }>;
  verification: BalanceVerification;
  bankTerms?: BankTerms;
  warnings: string[];
}
