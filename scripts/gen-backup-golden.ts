// Génère une sauvegarde « dorée » du format de fichier. À N'EXÉCUTER QUE pour créer une NOUVELLE
// version (ex. backup-v2.json). Ne jamais régénérer backup-v1.json : il prouve que les anciennes
// sauvegardes se relisent. Mot de passe et données INVENTÉS, uniquement pour les tests.
import 'fake-indexeddb/auto';
import { writeFileSync } from 'node:fs';
import { EncryptedStore } from '../src/storage';

const version = process.argv[2];
if (!version || !/^v\d+$/.test(version)) {
  console.error('Usage : tsx scripts/gen-backup-golden.ts v1');
  process.exit(1);
}

const store = await EncryptedStore.open('golden', { now: () => Date.UTC(2020, 0, 1) });
await store.createVault('mot-de-passe-de-test-sauvegarde-' + version);
await store.put('settings', 'main', { exemple: 'réglage inventé', version: 1 });
await store.putMany('transactions', [
  { id: 'tx-0001', value: { montant: -1546, libelle: 'ACHAT INVENTE' } },
  { id: 'tx-0002', value: { montant: 250000, libelle: 'VIREMENT INVENTE' } },
]);
writeFileSync(`fixtures/backup-${version}.json`, (await store.exportBackup()) + '\n');
console.log('écrit : fixtures/backup-' + version + '.json');
