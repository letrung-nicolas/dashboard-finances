# Réglages et assistant de premier lancement

## Principe
Toutes les valeurs personnelles (revenu, jour de versement, découvert et taux, crédits, plafonds des
enveloppes, mots à masquer) se saisissent dans l'application et sont stockées **chiffrées** dans la collection
`settings`, enregistrement `main`. Rien de personnel n'est écrit dans le code, les tests ou la documentation :
les tests utilisent des valeurs inventées.

## Contenu (`domain/settings.ts`, version 1)
| Champ | Remarque |
|---|---|
| `monthlyIncomeCents`, `payDay` (1 à 31) | revenu mensuel net et jour de versement |
| `overdraftLimitCents`, `overdraftRatePercent` | vide = pas de découvert ; le taux est obligatoire dès qu'il y a un plafond |
| `loans[]` | mensualité, taux annuel, date de fin (AAAA-MM-JJ, jour réel vérifié) ; nom facultatif |
| `envelopes[3]` | trois enveloppes, noms modifiables (défauts : Vie obligatoire, Vie plaisir assumée, Imprévus), plafonds à saisir |
| `maskWords[]` | mots exclus de toute analyse exportée ; 2 caractères minimum, 50 maximum, doublons retirés |
| `idSecret` | 32 octets aléatoires créés au premier lancement : sert aux identifiants d'opérations (`docs/connectors.md`) |
| `accounts` | correspondance clé de compte d'un fichier -> identifiant interne aléatoire |

L'IBAN complet n'est **jamais demandé**. Les analyseurs de fichiers ne doivent fournir que les derniers
chiffres du compte comme clé ; l'affichage passe par `maskAccountNumber` (4 derniers caractères).

## Fonctionnement
- Au premier déverrouillage sans réglages, l'assistant (5 étapes : Revenus, Découvert, Crédits, Enveloppes,
  Confidentialité) s'affiche. Chaque étape valide ses champs ; rien n'est enregistré avant « Terminer ».
- Ensuite, `/reglages` affiche les mêmes sections sur une page. Le secret d'identifiants et les comptes sont
  conservés à chaque modification.
- Le formulaire manipule du texte brut ; `settingsFromForm` valide et convertit (centimes entiers, pourcentages).
- Verrouiller efface les réglages de la mémoire.

## Changer le format
Toute évolution du contenu de `Settings` = nouvelle `version`, migration dans `storage/migrations.ts` (version
du schéma de données), test et sauvegarde figée de l'ancienne version (voir `docs/storage.md`).
