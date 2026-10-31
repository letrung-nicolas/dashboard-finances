import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EncryptedStore, StorageError } from '../src/storage';
import type { Migration } from '../src/storage';
import { CryptoError } from '../src/crypto';

const PASSWORD = 'un-mot-de-passe-de-test-solide';
let counter = 0;
const uniqueName = () => 'test-db-' + ++counter;

async function newStore(options = {}, name = uniqueName()) {
  const store = await EncryptedStore.open(name, options);
  return { store, name };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof StorageError || e instanceof CryptoError) return e.code;
    throw e;
  }
  return 'AUCUNE_ERREUR';
}

/** Lecture directe de la base, comme le ferait quelqu'un qui copie le disque. */
function rawDump(name: string): Promise<{ records: Array<[string, Uint8Array]>; meta: Array<[string, unknown]> }> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['records', 'meta'], 'readonly');
      const records: Array<[string, Uint8Array]> = [];
      const meta: Array<[string, unknown]> = [];
      const c1 = tx.objectStore('records').openCursor();
      c1.onsuccess = () => {
        const c = c1.result;
        if (c) {
          records.push([String(c.key), c.value as Uint8Array]);
          c.continue();
        }
      };
      const c2 = tx.objectStore('meta').openCursor();
      c2.onsuccess = () => {
        const c = c2.result;
        if (c) {
          meta.push([String(c.key), c.value]);
          c.continue();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve({ records, meta });
      };
    };
  });
}

function overwriteRecord(name: string, key: string, value: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(name);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('stockage chiffré', () => {
  it('aller-retour : put, get, getAll, count, remove', async () => {
    const { store } = await newStore();
    await store.createVault(PASSWORD);
    await store.put('settings', 'main', { revenu: 'inventé', n: 1 });
    await store.putMany('transactions', [
      { id: 't1', value: { montant: -1250 } },
      { id: 't2', value: { montant: 300000 } },
    ]);
    expect(await store.get('settings', 'main')).toEqual({ revenu: 'inventé', n: 1 });
    expect(await store.get('settings', 'absent')).toBeUndefined();
    expect(await store.count('transactions')).toBe(2);
    const all = await store.getAll<{ montant: number }>('transactions');
    expect(all.map((e) => e.id).sort()).toEqual(['t1', 't2']);
    expect(all.map((e) => e.value.montant).sort((a, b) => a - b)).toEqual([-1250, 300000]);
    await store.remove('transactions', 't1');
    expect(await store.count('transactions')).toBe(1);
  }, 30000);

  it('rien de lisible sur le disque : ni valeur, ni libellé, ni montant', async () => {
    const { store, name } = await newStore();
    await store.createVault(PASSWORD);
    await store.put('transactions', 'opaque-1', { libelle: 'LIBELLE-SECRET-INVENTE', montant: -987654 });
    const { records, meta } = await rawDump(name);
    for (const [key, bytes] of records) {
      expect(key).toMatch(/^[a-z-]+\/[A-Za-z0-9_-]+$/);
      let latin1 = '';
      for (let i = 0; i < bytes.length; i++) latin1 += String.fromCharCode(bytes[i]);
      expect(latin1).not.toContain('LIBELLE-SECRET-INVENTE');
      expect(latin1).not.toContain('987654');
    }
    expect(meta.map(([k]) => k).sort()).toEqual(['schemaVersion', 'vaultHeader']);
    expect(JSON.stringify(meta)).not.toContain('LIBELLE-SECRET-INVENTE');
  }, 30000);

  it('verrouillé : tout accès est refusé ; mauvais mot de passe refusé ; bon mot de passe rouvre', async () => {
    const { store } = await newStore();
    await store.createVault(PASSWORD);
    await store.put('settings', 'main', { a: 1 });
    store.lock();
    expect(store.isUnlocked).toBe(false);
    expect(await codeOf(store.get('settings', 'main'))).toBe('NOT_UNLOCKED');
    expect(await codeOf(store.put('settings', 'main', {}))).toBe('NOT_UNLOCKED');
    expect(await codeOf(store.unlock(PASSWORD + 'x'))).toBe('WRONG_PASSWORD');
    expect(store.isUnlocked).toBe(false);
    await store.unlock(PASSWORD);
    expect(await store.get('settings', 'main')).toEqual({ a: 1 });
  }, 30000);

  it('refuse un second coffre, et un déverrouillage sans coffre', async () => {
    const { store } = await newStore();
    expect(await codeOf(store.unlock(PASSWORD))).toBe('NO_VAULT');
    await store.createVault(PASSWORD);
    expect(await codeOf(store.createVault(PASSWORD))).toBe('VAULT_EXISTS');
  }, 30000);

  it('un enregistrement altéré sur le disque est détecté', async () => {
    const { store, name } = await newStore();
    await store.createVault(PASSWORD);
    await store.put('settings', 'main', { a: 1 });
    const { records } = await rawDump(name);
    const target = records.filter(([k]) => k === 'settings/main')[0];
    const tampered = new Uint8Array(target[1]);
    tampered[20] = tampered[20] ^ 1;
    await overwriteRecord(name, 'settings/main', tampered);
    expect(await codeOf(store.get('settings', 'main'))).toBe('CORRUPTED');
  }, 30000);

  it('échanger deux enregistrements dans la base est détecté (lié à la clé)', async () => {
    const { store, name } = await newStore();
    await store.createVault(PASSWORD);
    await store.put('transactions', 'a', { montant: 100 });
    await store.put('transactions', 'b', { montant: 999 });
    const { records } = await rawDump(name);
    const a = records.filter(([k]) => k === 'transactions/a')[0][1];
    await overwriteRecord(name, 'transactions/b', a);
    expect(await codeOf(store.get('transactions', 'b'))).toBe('CORRUPTED');
  }, 30000);

  it('refuse des noms de collection et des identifiants invalides', async () => {
    const { store } = await newStore();
    await store.createVault(PASSWORD);
    expect(await codeOf(store.put('Mauvais Nom', 'x', {}))).toBe('INVALID_KEY');
    expect(await codeOf(store.put('settings', '', {}))).toBe('INVALID_KEY');
  }, 30000);

  it('changement de mot de passe et d’itérations : les données restent lisibles', async () => {
    const { store, name } = await newStore();
    await store.createVault(PASSWORD);
    await store.put('settings', 'main', { a: 1 });
    await store.changePassword(PASSWORD, 'un-autre-mot-de-passe-solide', 700000);
    expect(store.iterations).toBe(700000);
    store.close();
    const reopened = await EncryptedStore.open(name);
    expect(await codeOf(reopened.unlock(PASSWORD))).toBe('WRONG_PASSWORD');
    await reopened.unlock('un-autre-mot-de-passe-solide');
    expect(await reopened.get('settings', 'main')).toEqual({ a: 1 });
  }, 60000);
});

describe('suivi de sauvegarde', () => {
  it('compte les modifications, se remet à zéro à la sauvegarde, persiste après verrouillage', async () => {
    let time = 1000;
    const { store } = await newStore({ now: () => time });
    await store.createVault(PASSWORD);
    expect(store.getBackupState()).toEqual({ lastBackupAt: null, changesSinceBackup: 0 });
    await store.put('settings', 'main', { a: 1 });
    await store.putMany('transactions', [
      { id: 't1', value: 1 },
      { id: 't2', value: 2 },
    ]);
    expect(store.getBackupState().changesSinceBackup).toBe(3);
    store.lock();
    await store.unlock(PASSWORD);
    expect(store.getBackupState().changesSinceBackup).toBe(3);
    time = 5000;
    await store.exportBackup();
    expect(store.getBackupState()).toEqual({ lastBackupAt: 5000, changesSinceBackup: 0 });
    await store.remove('transactions', 't1');
    expect(store.getBackupState().changesSinceBackup).toBe(1);
  }, 30000);

  it('prévient les abonnés (pour le rappel affiché)', async () => {
    const { store } = await newStore();
    await store.createVault(PASSWORD);
    let calls = 0;
    const stop = store.subscribe(() => calls++);
    await store.put('settings', 'main', {});
    expect(calls).toBeGreaterThan(0);
    stop();
    const before = calls;
    await store.put('settings', 'main', { b: 2 });
    expect(calls).toBe(before);
  }, 30000);
});

describe('sauvegarde et restauration', () => {
  it('aller-retour complet sur un appareil vierge, sans rien de lisible dans le fichier', async () => {
    const source = await newStore();
    await source.store.createVault(PASSWORD);
    await source.store.put('settings', 'main', { note: 'NOTE-SECRETE-INVENTEE' });
    await source.store.putMany('transactions', [{ id: 't1', value: { montant: -4242 } }]);
    const text = await source.store.exportBackup();
    expect(text).not.toContain('NOTE-SECRETE-INVENTEE');
    expect(text).not.toContain('4242');

    const target = await newStore();
    expect(await target.store.hasVault()).toBe(false);
    await target.store.restoreBackup(text, PASSWORD);
    expect(target.store.isUnlocked).toBe(false);
    await target.store.unlock(PASSWORD);
    expect(await target.store.get('settings', 'main')).toEqual({ note: 'NOTE-SECRETE-INVENTEE' });
    expect(await target.store.get('transactions', 't1')).toEqual({ montant: -4242 });
  }, 60000);

  it('mauvais mot de passe ou fichier altéré : refusé, et la base existante est intacte', async () => {
    const source = await newStore();
    await source.store.createVault(PASSWORD);
    await source.store.put('settings', 'main', { a: 1 });
    const text = await source.store.exportBackup();

    const target = await newStore();
    await target.store.createVault('mot-de-passe-de-la-cible-ok');
    await target.store.put('settings', 'main', { cible: true });

    expect(await codeOf(target.store.restoreBackup(text, 'incorrect-incorrect'))).toBe('WRONG_PASSWORD');

    const parsed = JSON.parse(text);
    const first = parsed.records[0];
    first.d = first.d.slice(0, 40) + (first.d[40] === 'A' ? 'B' : 'A') + first.d.slice(41);
    expect(await codeOf(target.store.restoreBackup(JSON.stringify(parsed), PASSWORD))).toBe('BACKUP_INVALID');

    expect(await codeOf(target.store.restoreBackup('pas du json', PASSWORD))).toBe('BACKUP_INVALID');
    expect(await codeOf(target.store.restoreBackup('{"format":"autre"}', PASSWORD))).toBe('BACKUP_INVALID');

    // la base cible n'a pas bougé
    expect(await target.store.get('settings', 'main')).toEqual({ cible: true });
  }, 60000);

  it('refuse une sauvegarde plus récente que l’application', async () => {
    const source = await newStore();
    await source.store.createVault(PASSWORD);
    const parsed = JSON.parse(await source.store.exportBackup());
    const target = await newStore();
    expect(
      await codeOf(target.store.restoreBackup(JSON.stringify({ ...parsed, formatVersion: 99 }), PASSWORD)),
    ).toBe('BACKUP_UNSUPPORTED');
    expect(
      await codeOf(target.store.restoreBackup(JSON.stringify({ ...parsed, schemaVersion: 99 }), PASSWORD)),
    ).toBe('BACKUP_UNSUPPORTED');
  }, 30000);
});

describe('migrations de schéma', () => {
  const v1to2: Migration = {
    from: 1,
    to: 2,
    async run(ctx) {
      const all = await ctx.getAll<{ montant: number }>('transactions');
      for (const e of all) await ctx.put('transactions', e.id, { cents: e.value.montant, migre: true });
    },
  };

  it('migre les données au déverrouillage, puis ne rejoue pas la migration', async () => {
    const name = uniqueName();
    const v1 = await EncryptedStore.open(name, { schemaVersion: 1 });
    await v1.createVault(PASSWORD);
    await v1.put('transactions', 't1', { montant: -500 });
    v1.close();

    const v2 = await EncryptedStore.open(name, { schemaVersion: 2, migrations: [v1to2] });
    await v2.unlock(PASSWORD);
    expect(await v2.get('transactions', 't1')).toEqual({ cents: -500, migre: true });
    v2.close();

    const again = await EncryptedStore.open(name, { schemaVersion: 2, migrations: [v1to2] });
    await again.unlock(PASSWORD);
    expect(await again.get('transactions', 't1')).toEqual({ cents: -500, migre: true });
  }, 60000);

  it('migration en échec : retour arrière complet, données intactes', async () => {
    const name = uniqueName();
    const v1 = await EncryptedStore.open(name, { schemaVersion: 1 });
    await v1.createVault(PASSWORD);
    await v1.putMany('transactions', [
      { id: 't1', value: { montant: -500 } },
      { id: 't2', value: { montant: -700 } },
    ]);
    v1.close();

    const failing: Migration = {
      from: 1,
      to: 2,
      async run(ctx) {
        await ctx.put('transactions', 't1', { corrompu: true });
        throw new Error('panne simulée');
      },
    };
    const v2 = await EncryptedStore.open(name, { schemaVersion: 2, migrations: [failing] });
    expect(await codeOf(v2.unlock(PASSWORD))).toBe('MIGRATION_FAILED');
    expect(v2.isUnlocked).toBe(false);

    const back = await EncryptedStore.open(name, { schemaVersion: 1 });
    await back.unlock(PASSWORD);
    expect(await back.get('transactions', 't1')).toEqual({ montant: -500 });
    expect(await back.get('transactions', 't2')).toEqual({ montant: -700 });
  }, 60000);

  it('données plus récentes que l’application, ou chemin de migration absent : refusé proprement', async () => {
    const name = uniqueName();
    const v2 = await EncryptedStore.open(name, { schemaVersion: 2, migrations: [v1to2] });
    await v2.createVault(PASSWORD);
    v2.close();
    const old = await EncryptedStore.open(name, { schemaVersion: 1 });
    expect(await codeOf(old.unlock(PASSWORD))).toBe('UNSUPPORTED_DATA_VERSION');

    const name2 = uniqueName();
    const a = await EncryptedStore.open(name2, { schemaVersion: 1 });
    await a.createVault(PASSWORD);
    a.close();
    const b = await EncryptedStore.open(name2, { schemaVersion: 2, migrations: [] });
    expect(await codeOf(b.unlock(PASSWORD))).toBe('MIGRATION_FAILED');
  }, 60000);
});

describe('compatibilité : sauvegarde v1 figée (ne jamais régénérer fixtures/backup-v1.json)', () => {
  it('une sauvegarde créée par la version 1 se restaure et se relit', async () => {
    const text = readFileSync('fixtures/backup-v1.json', 'utf8');
    const { store } = await newStore();
    await store.restoreBackup(text, 'mot-de-passe-de-test-sauvegarde-v1');
    await store.unlock('mot-de-passe-de-test-sauvegarde-v1');
    expect(await store.get('settings', 'main')).toEqual({ exemple: 'réglage inventé', version: 1 });
    const tx = await store.getAll<{ montant: number; libelle: string }>('transactions');
    expect(tx.map((e) => e.id).sort()).toEqual(['tx-0001', 'tx-0002']);
    expect(tx.filter((e) => e.id === 'tx-0001')[0].value).toEqual({ montant: -1546, libelle: 'ACHAT INVENTE' });
  }, 60000);
});
