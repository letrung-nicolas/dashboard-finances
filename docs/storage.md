# Stockage (`src/storage/`)

## Ce qui est stocké, et où
Base IndexedDB `finances`, deux magasins :
- `meta` (en clair, non sensible) : `vaultHeader` (sel, itérations, clé de données enveloppée, voir
  `docs/crypto.md`) et `schemaVersion`.
- `records` : clé `collection/id`, valeur = enveloppe AES-GCM. Seuls le nom de collection et l'identifiant
  sont lisibles : **les identifiants doivent rester opaques** (jamais un libellé, une date ou un montant).
  Le nombre d'enregistrements par collection est visible par qui copie le disque.

Chaque enregistrement est chiffré avec la clé du coffre, avec sa clé `collection/id` comme données associées :
altérer un enregistrement, ou en échanger deux, fait échouer le déchiffrement.

## Trois numéros de version, à ne pas confondre
| Version | Concerne | Où |
|---|---|---|
| `IDB_VERSION` | structure IndexedDB (magasins) | `storage/types.ts` |
| `SCHEMA_VERSION` | contenu des enregistrements | `storage/types.ts`, migrations dans `storage/migrations.ts` |
| `BACKUP_FORMAT_VERSION` | format du fichier de sauvegarde | `storage/backup.ts` |

## Migrations des données
Exécutées au déverrouillage (il faut la clé). Un instantané chiffré est pris avant ; si une étape échoue, il est
restauré tel quel (retour arrière complet) et le déverrouillage est refusé. Des données plus récentes que
l'application sont refusées sans être touchées.
Pour changer le schéma : ajouter une `Migration` + un test + une sauvegarde figée de l'ancienne version
(`npx tsx scripts/gen-backup-golden.ts vN`). **Ne jamais régénérer `fixtures/backup-v1.json`.**

## Sauvegarde / restauration
Fichier `finances-AAAA-MM-JJ.sauvegarde.json` : en-tête du coffre + enregistrements déjà chiffrés. Sans le
mot de passe, il est illisible. La restauration vérifie le mot de passe ET l'intégrité de chaque enregistrement
avant d'écrire quoi que ce soit, puis remplace tout le contenu local en une seule transaction. Le mot de passe
du coffre devient celui de la sauvegarde.

Rappel : le compteur « modifications non sauvegardées » est alimenté par toute écriture (les imports des
étapes 7 et 8 le déclenchent donc sans code spécifique). Une sauvegarde est comptée à la **génération** du
fichier : le navigateur ne confirme pas qu'il a bien été enregistré sur le téléphone.

## Verrouillage automatique
Après 5 minutes sans activité (`app/idleLock.ts`). Les minuteurs sont gelés quand un téléphone met la page en
veille : l'heure réelle est donc aussi vérifiée au retour de la page (`visibilitychange`, `focus`).
Verrouiller oublie la clé en mémoire ; rien n'est lisible sans le mot de passe.

## Limites
- Le navigateur peut effacer IndexedDB (Safari après une longue absence, nettoyage, changement d'appareil).
  `navigator.storage.persist()` est demandé mais sans garantie : **la sauvegarde est la seule vraie protection**.
- Navigation privée : le stockage peut être indisponible ; l'application l'indique.
- Le téléchargement sur iPhone ouvre souvent un aperçu ou la feuille de partage au lieu d'enregistrer
  directement : à vérifier sur appareil réel.
