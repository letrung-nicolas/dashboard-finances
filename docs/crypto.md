# Chiffrement (`src/crypto/`)

## Principe
```
mot de passe --PBKDF2-SHA256 (sel, itérations)--> KEK        (jamais stockée)
DEK (clé de données, 256 bits aléatoires) --AES-GCM par la KEK--> wrappedKey   (stockée dans l'en-tête)
données --AES-GCM par la DEK--> enveloppes [version | IV 12 octets | chiffré + étiquette 16 octets]
```
- La **DEK** chiffre toutes les données. Elle est tirée au hasard à la création du coffre.
- Changer le mot de passe ou le nombre d'itérations ne ré-encrypte que la DEK (`rewrapVault`),
  jamais les données : « ajuster sans casser les données existantes ».
- `wrappedKey` sert de **vérificateur** : un mauvais mot de passe fait échouer l'authentification
  AES-GCM, sans stocker de hachage du mot de passe.
- Le nombre d'itérations, le sel et la version sont dans l'en-tête, et **liés au chiffré** (données
  associées AES-GCM) : les altérer fait échouer l'ouverture (`WRONG_PASSWORD`).
- Clés WebCrypto **non extractables** (KEK et DEK).
- Un **IV neuf** (12 octets aléatoires) à chaque chiffrement. Chaque enregistrement pourra être lié à
  son identifiant via les données associées, pour empêcher d'échanger deux chiffrés (étape 4).
- Mot de passe normalisé en **Unicode NFC** avant dérivation (un « é » saisi sur Mac ou sur
  téléphone n'a pas toujours la même forme).

## Paramètres
| Paramètre | Valeur |
|---|---|
| Dérivation | PBKDF2-SHA256, 600 000 itérations minimum à la création (`MIN_ITERATIONS`) |
| Sel | 16 octets aléatoires |
| Chiffrement | AES-GCM 256 bits, IV 96 bits, étiquette 128 bits |
| Mot de passe | 12 caractères minimum |
| Lecture d'un coffre existant | accepte de 100 000 à 10 000 000 itérations (celles stockées) |

Le plancher de 600 000 itérations suit la recommandation OWASP pour PBKDF2-HMAC-SHA256 (Password
Storage Cheat Sheet), à revérifier à chaque revue : https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

## Temps de dérivation
Mesuré par `measureDerivationMs` (page `/#/outils/crypto` de l'application).

| Appareil | 600 000 itérations | Statut |
|---|---|---|
| Serveur de développement (Xeon 2,1 GHz, Node, OpenSSL natif) | 88 à 101 ms | **mesuré**, référence rapide uniquement |
| Téléphone | à mesurer | à compléter |
| Mac ancien | à mesurer | à compléter |

Le serveur ci-dessus n'est PAS un appareil lent. Les navigateurs de téléphone et de vieux Mac
seront plus lents (ordre de grandeur attendu : plusieurs fois plus, estimation non mesurée).
Si un appareil dépasse un seuil pénible à l'ouverture, on ajuste via `rewrapVault` plutôt que de
supprimer le plancher.

## Changer le format (règle du dépôt)
Toute évolution du format de l'en-tête ou des enveloppes = nouvelle `VAULT_VERSION` / `ENVELOPE_VERSION`,
migration versionnée, nouvelle fixture `fixtures/vault-vN.json` (générée par
`npx tsx scripts/gen-vault-golden.ts vN`) et conservation des anciennes fixtures : le test
« coffre v1 figé » prouve que les anciens coffres restent lisibles. **Ne jamais régénérer `vault-v1.json`.**

## Limites assumées
- Le chiffrement protège un disque ou une sauvegarde volés, pas un navigateur compromis, une
  extension malveillante ou un mot de passe faible.
- Mot de passe perdu = données perdues : aucune récupération possible.
- La DEK existe brièvement en clair dans la mémoire JavaScript pendant l'ouverture, puis le tampon est mis à zéro.
