import { describe, expect, it } from 'vitest';
import { bytesToHex, hmacSha256Hex, sha256Hex } from '../src/crypto';
import { assignIds, FileConnector, transactionId } from '../src/connectors';
import type { ConnectorContext, FileParser } from '../src/connectors';
import type { ParseResult, TransactionDraft } from '../src/domain';

const SECRET = new Uint8Array(32).map((_, i) => i + 1);
const OTHER_SECRET = new Uint8Array(32).map((_, i) => 255 - i);
const enc = (s: string) => new TextEncoder().encode(s);

const draft = (over: Partial<TransactionDraft> = {}): TransactionDraft => ({
  accountKey: 'k1',
  date: '2026-03-05',
  amountCents: -1546,
  rawLabel: 'ACHAT INVENTE',
  ...over,
});

describe('empreintes (vecteurs de référence)', () => {
  it('SHA-256 de « abc »', async () => {
    expect(await sha256Hex(enc('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('HMAC-SHA256, cas 1 de la RFC 4231', async () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(await hmacSha256Hex(key, 'Hi There')).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('hexadécimal sur deux chiffres par octet', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });
});

describe('identifiants d’opérations', () => {
  it('stables : mêmes entrées, même identifiant ; 32 caractères hexadécimaux', async () => {
    const a = await transactionId(SECRET, 'acc', draft(), 0);
    const b = await transactionId(SECRET, 'acc', draft(), 0);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it('changent si le compte, la date, le montant, le libellé, le rang ou le secret changent', async () => {
    const base = await transactionId(SECRET, 'acc', draft(), 0);
    const variants = await Promise.all([
      transactionId(SECRET, 'autre', draft(), 0),
      transactionId(SECRET, 'acc', draft({ date: '2026-03-06' }), 0),
      transactionId(SECRET, 'acc', draft({ amountCents: -1547 }), 0),
      transactionId(SECRET, 'acc', draft({ rawLabel: 'AUTRE LIBELLE' }), 0),
      transactionId(SECRET, 'acc', draft(), 1),
      transactionId(OTHER_SECRET, 'acc', draft(), 0),
    ]);
    for (const v of variants) expect(v).not.toBe(base);
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('insensibles à la casse et aux espaces du libellé (même opération, deux formats d’espaces)', async () => {
    const a = await transactionId(SECRET, 'acc', draft({ rawLabel: 'Achat  Inventé' }), 0);
    const b = await transactionId(SECRET, 'acc', draft({ rawLabel: 'ACHAT INVENTÉ' }), 0);
    expect(a).toBe(b);
  });

  it('ne laissent rien deviner : sans le secret, impossible de retrouver le libellé ou le montant', async () => {
    const id = await transactionId(SECRET, 'acc', draft(), 0);
    expect(id).not.toContain('1546');
    expect(id).not.toContain('2026');
    // un attaquant qui tente les mêmes données avec un autre secret n'obtient pas le même identifiant
    expect(await transactionId(OTHER_SECRET, 'acc', draft(), 0)).not.toBe(id);
  });
});

describe('RÈGLE : jamais de dédoublonnage à l’intérieur d’un même fichier', () => {
  it('deux achats identiques le même jour restent DEUX opérations, avec deux identifiants', async () => {
    const drafts = [draft(), draft(), draft({ amountCents: -300 }), draft()];
    const ids = await assignIds(SECRET, drafts, ['acc', 'acc', 'acc', 'acc']);
    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(4); // les trois achats identiques sont distincts
  });

  it('réimporter le même fichier redonne exactement les mêmes identifiants', async () => {
    const drafts = [draft(), draft(), draft({ amountCents: -300 })];
    const first = await assignIds(SECRET, drafts, ['acc', 'acc', 'acc']);
    const second = await assignIds(SECRET, drafts, ['acc', 'acc', 'acc']);
    expect(second).toEqual(first);
  });

  it('le rang est compté par compte : même opération sur deux comptes = deux identifiants, rang 0 chacun', async () => {
    const ids = await assignIds(SECRET, [draft(), draft()], ['acc-a', 'acc-b']);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toBe(await transactionId(SECRET, 'acc-a', draft(), 0));
    expect(ids[1]).toBe(await transactionId(SECRET, 'acc-b', draft(), 0));
  });
});

describe('connecteur fichier', () => {
  const result: ParseResult = {
    drafts: [
      draft({ date: '2026-03-02', rawLabel: 'A' }),
      draft({ date: '2026-03-10', rawLabel: 'B' }),
      draft({ date: '2026-03-10', rawLabel: 'B' }),
    ],
    balances: [{ accountKey: 'k1', date: '2026-03-31', balanceCents: -50000, kind: 'statement-closing' }],
    verification: { status: 'not-verified', message: 'solde non vérifié' },
    warnings: ['avertissement inventé'],
  };
  const parser: FileParser = {
    id: 'faux',
    name: 'Faux analyseur',
    format: 'test',
    parse: async () => result,
  };
  const ctx: ConnectorContext = { idSecret: SECRET, resolveAccountId: (key) => 'acc-' + key };

  it('renvoie le format normalisé avec compte, source et identifiants stables', async () => {
    const connector = new FileConnector(parser, ctx);
    const report = await connector.addFile('releve-invente.pdf', enc('contenu A'));
    expect(report.transactionCount).toBe(3);
    expect(report.fileHash).toBe(await sha256Hex(enc('contenu A')));
    expect(report.verification.status).toBe('not-verified');
    expect(report.warnings).toEqual(['avertissement inventé']);

    const txs = await connector.fetchTransactions();
    expect(txs.length).toBe(3);
    expect(txs[0].accountId).toBe('acc-k1');
    expect(txs[0].source).toEqual({
      connectorId: 'faux',
      format: 'test',
      fileHash: report.fileHash,
      fileName: 'releve-invente.pdf',
    });
    expect(new Set(txs.map((t) => t.id)).size).toBe(3); // les deux « B » du même fichier sont conservés
  });

  it('filtre par date de début et renvoie les soldes avec le compte résolu', async () => {
    const connector = new FileConnector(parser, ctx);
    await connector.addFile('f.pdf', enc('x'));
    expect((await connector.fetchTransactions('2026-03-10')).length).toBe(2);
    const balances = await (connector.fetchBalances as () => Promise<unknown[]>)();
    expect(balances).toEqual([
      { accountId: 'acc-k1', date: '2026-03-31', balanceCents: -50000, kind: 'statement-closing' },
    ]);
  });

  it('même fichier ajouté deux fois : une seule copie, mêmes identifiants', async () => {
    const connector = new FileConnector(parser, ctx);
    const r1 = await connector.addFile('f.pdf', enc('meme contenu'));
    const first = await connector.fetchTransactions();
    const r2 = await connector.addFile('f.pdf', enc('meme contenu'));
    const second = await connector.fetchTransactions();
    expect(r2.fileHash).toBe(r1.fileHash);
    expect(second.map((t) => t.id)).toEqual(first.map((t) => t.id));
    expect(second.length).toBe(3);
  });

  it('propage l’erreur d’un analyseur sans rien charger', async () => {
    const failing: FileParser = { ...parser, parse: async () => { throw new Error('format illisible'); } };
    const connector = new FileConnector(failing, ctx);
    await expect(connector.addFile('f.pdf', enc('x'))).rejects.toThrow('format illisible');
    expect(await connector.fetchTransactions()).toEqual([]);
  });
});
