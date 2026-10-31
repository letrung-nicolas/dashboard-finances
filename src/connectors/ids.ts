import { hmacSha256Hex } from '../crypto';
import { normalizeLabel } from '../domain';
import type { TransactionDraft } from '../domain';

const SEP = '\u001f';

/**
 * Identifiant stable d'une opération : HMAC du compte, de la date, du montant, du libellé normalisé
 * et du RANG de l'opération parmi les opérations identiques du même fichier.
 *
 * - Réimporter le même fichier redonne les mêmes identifiants (aucun ajout).
 * - Deux opérations identiques le même jour dans un même fichier (deux achats légitimes) ont des
 *   rangs 0 et 1, donc deux identifiants : on ne dédoublonne JAMAIS à l'intérieur d'un fichier.
 * - Le secret empêche de retrouver date, montant ou libellé en devinant l'identifiant (lisible sur disque).
 */
export function transactionId(
  secret: Uint8Array,
  accountId: string,
  draft: TransactionDraft,
  rank: number,
): Promise<string> {
  const message = [accountId, draft.date, String(draft.amountCents), normalizeLabel(draft.rawLabel), String(rank)].join(SEP);
  return hmacSha256Hex(secret, message).then((hex) => hex.slice(0, 32));
}

/** Attribue les identifiants dans l'ordre du fichier. `accountIds` est parallèle à `drafts`. */
export async function assignIds(
  secret: Uint8Array,
  drafts: TransactionDraft[],
  accountIds: string[],
): Promise<string[]> {
  const seen: { [signature: string]: number } = {};
  const ids: string[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const signature = [accountIds[i], d.date, String(d.amountCents), normalizeLabel(d.rawLabel)].join(SEP);
    const rank = seen[signature] || 0;
    seen[signature] = rank + 1;
    ids.push(await transactionId(secret, accountIds[i], d, rank));
  }
  return ids;
}
