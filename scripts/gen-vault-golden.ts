// Génère une fixture « dorée » du format de coffre. À N'EXÉCUTER QUE pour créer une NOUVELLE version
// (ex. vault-v2.json). Ne jamais régénérer vault-v1.json : il prouve que les anciens coffres s'ouvrent.
// Mot de passe INVENTÉ, uniquement pour les tests.
import { writeFileSync } from 'node:fs';
import { bytesToBase64, createVault, encryptJson } from '../src/crypto';

const version = process.argv[2];
if (!version || !/^v\d+$/.test(version)) {
  console.error('Usage : tsx scripts/gen-vault-golden.ts v1');
  process.exit(1);
}

const password = 'mot-de-passe-de-test-' + version;
const aad = 'enregistrement:exemple';
const plaintext = { libelle: 'Opération de test', centimes: -1234 };

const vault = await createVault(password);
const envelope = await encryptJson(vault.key, plaintext, aad);

writeFileSync(
  `fixtures/vault-${version}.json`,
  JSON.stringify(
    {
      description: 'Fixture inventée du format de coffre. Ne pas régénérer.',
      password,
      header: vault.header,
      sample: { aad, plaintext, envelope: bytesToBase64(envelope) },
    },
    null,
    2,
  ) + '\n',
);
console.log('écrit : fixtures/vault-' + version + '.json');
