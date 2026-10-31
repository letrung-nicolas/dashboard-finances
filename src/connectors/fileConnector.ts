import { sha256Hex } from '../crypto';
import type { AccountBalance, NormalizedTransaction } from '../domain';
import { assignIds } from './ids';
import type { Connector, ConnectorContext, FileImportReport, FileParser } from './types';

interface LoadedFile {
  transactions: NormalizedTransaction[];
  balances: AccountBalance[];
}

/**
 * Connecteur « fichier » : l'utilisateur dépose des fichiers, un analyseur les lit, et
 * `fetchTransactions` renvoie le format normalisé. Aucun réseau. Rien n'est écrit ici : l'import
 * (étapes 7 et 8) décide quoi stocker, et le dédoublonnage entre fichiers qui se chevauchent.
 */
export class FileConnector implements Connector {
  readonly id: string;
  readonly name: string;
  private files = new Map<string, LoadedFile>();

  constructor(
    private readonly parser: FileParser,
    private readonly ctx: ConnectorContext,
  ) {
    this.id = parser.id;
    this.name = parser.name;
  }

  async addFile(name: string, bytes: Uint8Array): Promise<FileImportReport> {
    const fileHash = await sha256Hex(bytes);
    const parsed = await this.parser.parse({ name, bytes });

    const accountIds: string[] = [];
    for (const d of parsed.drafts) accountIds.push(await this.ctx.resolveAccountId(d.accountKey));
    const ids = await assignIds(this.ctx.idSecret, parsed.drafts, accountIds);
    const source = { connectorId: this.id, format: this.parser.format, fileHash, fileName: name };

    const transactions: NormalizedTransaction[] = parsed.drafts.map((d, i) => ({
      id: ids[i],
      accountId: accountIds[i],
      date: d.date,
      valueDate: d.valueDate,
      amountCents: d.amountCents,
      rawLabel: d.rawLabel,
      source,
    }));

    const balances: AccountBalance[] = [];
    for (const b of parsed.balances) {
      balances.push({
        accountId: await this.ctx.resolveAccountId(b.accountKey),
        date: b.date,
        balanceCents: b.balanceCents,
        kind: b.kind,
      });
    }

    this.files.set(fileHash, { transactions, balances });
    return {
      fileHash,
      fileName: name,
      transactionCount: transactions.length,
      verification: parsed.verification,
      bankTerms: parsed.bankTerms,
      warnings: parsed.warnings,
    };
  }

  async fetchTransactions(since?: string): Promise<NormalizedTransaction[]> {
    const out: NormalizedTransaction[] = [];
    this.files.forEach((f) => {
      f.transactions.forEach((t) => {
        if (since === undefined || t.date >= since) out.push(t);
      });
    });
    return out;
  }

  async fetchBalances(): Promise<AccountBalance[]> {
    const out: AccountBalance[] = [];
    this.files.forEach((f) => f.balances.forEach((b) => out.push(b)));
    return out;
  }

  clear(): void {
    this.files.clear();
  }
}
