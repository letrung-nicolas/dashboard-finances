# Domaine et connecteurs (`src/domain/`, `src/connectors/`)

## Format unique
Le tableau de bord ne consomme QUE `NormalizedTransaction` :
`{ id, accountId, date (AAAA-MM-JJ), valueDate?, amountCents (entier signé), rawLabel, source }`.
Entrée d'argent > 0, sortie < 0. Jamais de flottant : `parseFrenchAmount` lit « 1 546,53 » (espaces
normaux, insécables et fins insécables, signe à gauche, à droite ou parenthèses) et refuse tout ce qui est
ambigu (3 décimales, deux virgules…) plutôt que de deviner.

## Interface
```
Connector { id, name, authenticate?(), fetchTransactions(since?), fetchBalances?() }
FileParser { id, name, format, parse({ name, bytes }) -> ParseResult }   // pur : ni réseau, ni stockage
FileConnector(parser, ctx)  // addFile(name, bytes) -> FileImportReport
```
Seuls les connecteurs « fichier » existent. Les analyseurs réels arrivent aux étapes 7 (PDF CA) et 8 (CSV, OFX).

## Identifiants d'opérations
`id = HMAC-SHA256(secret du coffre, compte | date | montant | libellé normalisé | rang)`, tronqué à 32
caractères hexadécimaux.
- **Pourquoi un secret** : l'identifiant est la clé de l'enregistrement et reste lisible sur le disque. Sans
  secret, un simple hachage permettrait de vérifier une supposition (« un achat de X € le jour J chez Y »).
- **Le rang** compte les opérations strictement identiques dans UN fichier, dans l'ordre du fichier.
  **On ne dédoublonne jamais à l'intérieur d'un fichier** : deux achats identiques le même jour sont deux
  opérations. Les 2e, 3e… ont un rang 1, 2… donc un autre identifiant.
- Réimporter le même fichier redonne les mêmes identifiants (aucun ajout).
- Le secret est un tirage aléatoire de 32 octets, créé à l'assistant de premier lancement (étape 6) et
  stocké chiffré avec les réglages. Il fait partie du coffre : il suit les sauvegardes.

## À savoir pour le dédoublonnage (étape 8)
L'identifiant stable ne suffit pas entre formats (un libellé PDF et un libellé CSV diffèrent) : l'étape 8
ajoute l'empreinte approchée (date à quelques jours près + montant + similarité de libellé) et la file
« probable » à confirmer. Entre deux fichiers du même format qui se chevauchent, le rang peut différer si un
fichier commence au milieu d'une journée : cas traité à l'étape 8, avec tests.

## Comptes
`accountKey` (donné par le fichier, ex. 4 derniers chiffres, **jamais un IBAN complet**) est converti en
`accountId` par `ctx.resolveAccountId`. L'application crée un identifiant aléatoire pour un compte nouveau et
mémorise la correspondance dans les réglages chiffrés.

## Contrôle de solde
`BalanceVerification.status` : `verified`, `mismatch` ou `not-verified`. Ce dernier s'affiche « solde non
vérifié » : un fichier sans soldes ne doit jamais passer pour vérifié.
