import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  CryptoError,
  createVault,
  decryptBytes,
  decryptJson,
  encryptBytes,
  encryptJson,
  measureDerivationMs,
  MIN_ITERATIONS,
  needsIterationUpgrade,
  parseVaultHeader,
  rewrapVault,
  unlockVault,
} from '../src/crypto';
import type { UnlockedVault } from '../src/crypto';

const PASSWORD = 'un-mot-de-passe-de-test-solide';

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof CryptoError) return e.code;
    throw e;
  }
  return 'AUCUNE_ERREUR';
}

function flip(bytes: Uint8Array, index: number): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[index] = copy[index] ^ 0x01;
  return copy;
}

describe('encodage', () => {
  it('aller-retour base64, y compris sur un gros tableau', () => {
    const big = new Uint8Array(200000);
    for (let i = 0; i < big.length; i++) big[i] = i % 251;
    expect(Array.from(base64ToBytes(bytesToBase64(big)).subarray(0, 300))).toEqual(
      Array.from(big.subarray(0, 300)),
    );
    expect(base64ToBytes(bytesToBase64(big)).length).toBe(big.length);
  });

  it('refuse un base64 invalide', () => {
    expect(() => base64ToBytes('pas du base64 !')).toThrow(CryptoError);
  });
});

describe('AES-GCM', () => {
  let vault: UnlockedVault;
  beforeAll(async () => {
    vault = await createVault(PASSWORD);
  }, 30000);

  it('aller-retour JSON avec accents', async () => {
    const value = { libelle: 'Prélèvement été', centimes: -4599, tags: ['a', 'é'] };
    const sealed = await encryptJson(vault.key, value);
    expect(await decryptJson(vault.key, sealed)).toEqual(value);
  });

  it('IV unique : 1000 chiffrements du même texte donnent 1000 sorties distinctes', async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4]);
    const ivs = new Set<string>();
    const outs = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const sealed = await encryptBytes(vault.key, plaintext);
      ivs.add(bytesToBase64(sealed.subarray(1, 13)));
      outs.add(bytesToBase64(sealed));
    }
    expect(ivs.size).toBe(1000);
    expect(outs.size).toBe(1000);
  });

  it('refuse toute altération : texte, IV, étiquette, version, troncature', async () => {
    const sealed = await encryptBytes(vault.key, new Uint8Array([9, 8, 7, 6, 5]));
    const last = sealed.length - 1;
    for (const tampered of [
      flip(sealed, 14), // texte chiffré
      flip(sealed, 3), // IV
      flip(sealed, last), // étiquette GCM
      flip(sealed, 0), // version
      sealed.subarray(0, last), // tronqué
      new Uint8Array(5),
    ]) {
      expect(await codeOf(decryptBytes(vault.key, tampered))).toBe('CORRUPTED');
    }
  });

  it("lie le chiffré à son contexte : mauvais AAD refusé (anti-échange d'enregistrements)", async () => {
    const sealed = await encryptBytes(vault.key, new Uint8Array([1]), 'enregistrement:A');
    expect(await codeOf(decryptBytes(vault.key, sealed, 'enregistrement:B'))).toBe('CORRUPTED');
    expect(await codeOf(decryptBytes(vault.key, sealed))).toBe('CORRUPTED');
    expect((await decryptBytes(vault.key, sealed, 'enregistrement:A')).length).toBe(1);
  });

  it('la clé de données est non extractable', async () => {
    expect(vault.key.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', vault.key)).rejects.toBeDefined();
  });
});

describe('coffre (mot de passe -> clé)', () => {
  let vault: UnlockedVault;
  beforeAll(async () => {
    vault = await createVault(PASSWORD);
  }, 30000);

  it("stocke le nombre d'itérations dans l'en-tête", () => {
    expect(vault.header.iterations).toBe(MIN_ITERATIONS);
    expect(needsIterationUpgrade(vault.header)).toBe(false);
  });

  it('bon mot de passe : la clé retrouvée déchiffre les données existantes', async () => {
    const sealed = await encryptJson(vault.key, { a: 1 });
    const again = await unlockVault(PASSWORD, vault.header);
    expect(await decryptJson(again.key, sealed)).toEqual({ a: 1 });
  }, 30000);

  it('mauvais mot de passe : refusé avec le code WRONG_PASSWORD', async () => {
    expect(await codeOf(unlockVault(PASSWORD + 'x', vault.header))).toBe('WRONG_PASSWORD');
  }, 30000);

  it('en-tête altéré (itérations ou sel) : refusé, sans geler ni planter', async () => {
    const lowerIterations = { ...vault.header, iterations: vault.header.iterations + 1 };
    expect(await codeOf(unlockVault(PASSWORD, lowerIterations))).toBe('WRONG_PASSWORD');
    const saltBytes = base64ToBytes(vault.header.salt);
    const otherSalt = { ...vault.header, salt: bytesToBase64(flip(saltBytes, 0)) };
    expect(await codeOf(unlockVault(PASSWORD, otherSalt))).toBe('WRONG_PASSWORD');
  }, 30000);

  it('normalise Unicode : é en un ou deux points de code ouvre le même coffre', async () => {
    const composed = 'caf' + String.fromCharCode(0xe9) + '-et-th' + String.fromCharCode(0xe9) + '-12345';
    const decomposed =
      'cafe' + String.fromCharCode(0x301) + '-et-the' + String.fromCharCode(0x301) + '-12345';
    expect(composed).not.toBe(decomposed);
    const v = await createVault(composed);
    const sealed = await encryptJson(v.key, 'ok');
    const reopened = await unlockVault(decomposed, v.header);
    expect(await decryptJson(reopened.key, sealed)).toBe('ok');
  }, 30000);

  it('refuse un mot de passe trop court et des itérations sous le plancher', async () => {
    expect(await codeOf(createVault('court'))).toBe('WEAK_PASSWORD');
    expect(await codeOf(createVault(PASSWORD, 1000))).toBe('WEAK_PARAMS');
    expect(await codeOf(createVault(PASSWORD, MIN_ITERATIONS - 1))).toBe('WEAK_PARAMS');
  });

  it("rewrap : nouveau mot de passe + plus d'itérations SANS casser les données existantes", async () => {
    const sealed = await encryptJson(vault.key, { solde: 4200 }, 'rec:1');
    const next = await rewrapVault(vault.header, PASSWORD, 'un-autre-mot-de-passe-solide', MIN_ITERATIONS + 100000);
    expect(next.header.iterations).toBe(MIN_ITERATIONS + 100000);
    expect(next.header.salt).not.toBe(vault.header.salt);
    // même clé de données : l'ancien chiffré reste lisible
    expect(await decryptJson(next.key, sealed, 'rec:1')).toEqual({ solde: 4200 });
    const reopened = await unlockVault('un-autre-mot-de-passe-solide', next.header);
    expect(await decryptJson(reopened.key, sealed, 'rec:1')).toEqual({ solde: 4200 });
    // l'ancien mot de passe ne marche plus sur le nouvel en-tête
    expect(await codeOf(unlockVault(PASSWORD, next.header))).toBe('WRONG_PASSWORD');
    // mauvais ancien mot de passe : rewrap refusé
    expect(await codeOf(rewrapVault(vault.header, 'incorrect-incorrect', 'nouveau-mot-de-passe-ok', MIN_ITERATIONS))).toBe('WRONG_PASSWORD');
  }, 60000);

  it('rejette un en-tête malformé', () => {
    const h = vault.header;
    const cases: unknown[] = [
      null,
      'texte',
      {},
      { ...h, version: 2 },
      { ...h, kdf: 'MD5' },
      { ...h, iterations: 5 },
      { ...h, iterations: 999999999 },
      { ...h, iterations: 600000.5 },
      { ...h, salt: 'AAAA' },
      { ...h, wrappedKey: '' },
    ];
    for (const c of cases) {
      expect(() => parseVaultHeader(c)).toThrow(CryptoError);
    }
  });
});

describe('compatibilité : coffre v1 figé (ne jamais régénérer fixtures/vault-v1.json)', () => {
  it('un coffre créé par la version 1 reste lisible', async () => {
    const golden = JSON.parse(readFileSync('fixtures/vault-v1.json', 'utf8'));
    const vault = await unlockVault(golden.password, golden.header);
    const value = await decryptJson(
      vault.key,
      base64ToBytes(golden.sample.envelope),
      golden.sample.aad,
    );
    expect(value).toEqual(golden.sample.plaintext);
  }, 30000);
});

describe('mesure de vitesse', () => {
  it('renvoie une durée positive', async () => {
    expect(await measureDerivationMs(1000)).toBeGreaterThanOrEqual(0);
  });
});
