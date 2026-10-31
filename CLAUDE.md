# CLAUDE.md : dashboard-finances

## Objectif
Application web de finances personnelles, 100 % dans le navigateur (aucun backend), en français,
pour analyser des relevés bancaires. Doit fonctionner sur téléphone et sur un Mac ancien
(cible ES2017, Safari/Firefox anciens, aucune API récente sans repli).

## Contraintes absolues
- 0 € de plus que l'abonnement Claude Pro : aucune API payante, aucun SDK Anthropic, aucune clé API.
- Dépôt GitHub PUBLIC : AUCUNE donnée personnelle nulle part (code, tests, docs, fixtures, commits,
  issues, ce fichier) : ni nom, adresse, IBAN, numéro de compte ou de carte, montant réel, revenu,
  crédit, découvert. Tout cela se saisit dans l'appli et reste chiffré dans le navigateur.
- Stack : React + Vite + TypeScript (+ Recharts à partir de la phase 1B), statique, GitHub Pages
  via GitHub Actions. Le déploiement ne s'exécute que sur `main`.
- UI en français, dark mode par défaut (vert = entrées, rouge/orange = sorties), mobile d'abord,
  montants au format français.
- CSP stricte : aucune requête sortante après chargement (`connect-src 'none'`),
  `worker-src 'self'` sans `blob:` ni CDN. Aucune police ni script externe.
- Tout changement du format de stockage ou de sauvegarde = migration versionnée + test,
  et relecture des sauvegardes des versions précédentes.

## Règle permanente : actions à faire par l'utilisateur
L'utilisateur est débutant. Chaque fois qu'il doit faire ou vérifier quelque chose lui-même, donner
EN BLOC DE CODE prêt à copier-coller :
- une phrase d'explication du pourquoi ;
- les valeurs à tester et les liens directs COMPLETS vers les pages GitHub concernées ;
- le message à renvoyer pour le cas « tout va bien » ET celui pour le cas « ça échoue »,
  déjà rédigés (sans demander de coller de données réelles : noms de fichiers, étapes, statuts seulement).

Liens utiles (dépôt public, aucune donnée personnelle) :
- Actions (CI) : https://github.com/letrung-nicolas/dashboard-finances/actions
- Comparer la branche à main / créer la PR :
  https://github.com/letrung-nicolas/dashboard-finances/compare/main...claude/architecture-plan-validation-htyub0
- Réglage Pages : https://github.com/letrung-nicolas/dashboard-finances/settings/pages
- E-mail privé GitHub : https://github.com/settings/emails
- Site publié (après fusion dans main) : https://letrung-nicolas.github.io/dashboard-finances/

## Architecture (src/)
app/ (shell, routage, verrouillage) · crypto/ · storage/ · connectors/ · import/ (pdf-ca, csv, ofx,
xlsx, qif, dedupe) · categorize/ · domain/ (types, KPI, enveloppes, projections, alertes : fonctions
pures) · analysis/ · documents/ · ui/ ; tests/ · fixtures/ · scripts/ · docs/ · .github/workflows/.
Les dossiers sont créés au fur et à mesure des phases.

## Conventions
- Montants en centimes entiers, dates ISO (`YYYY-MM-DD`), affichage `fr-FR`.
- `tsconfig` : lib ES2017 (les API récentes ne compilent pas : c'est voulu). Pas de `dangerouslySetInnerHTML`.
- Routage : `HashRouter` (Pages n'a pas de repli SPA). `base: '/dashboard-finances/'`.
- Faux numéros dans les fixtures : invalides ou masqués. Faux PDF générés par script au moment
  des tests, jamais commités (`*.pdf` est dans `.gitignore`).
- Dédoublonnage : jamais à l'intérieur d'un même fichier ; uniquement entre fichiers qui se
  chevauchent ; cas incertains « probable » conservés dans les totaux jusqu'à décision.
- Un commit par étape ; mettre à jour « Avancement » après chaque étape.

## Commandes
- `npm run dev` · `npm run build` · `npm run preview`
- `npm run lint` · `npm run typecheck` · `npm test`
- `npm run scan` : scan anti-données personnelles (IBAN FR valide, carte Luhn, e-mail, fichiers
  PDF/Excel/CSV hors fixtures). Le hook pre-commit (`scripts/hooks`, activé par `npm install` via
  `prepare`) lance le même scan sur l'index. Ne jamais afficher la valeur trouvée (journaux de CI
  publics). Marqueur `scan:allow` pour une ligne justifiée en revue.

## Avancement
Phase 1A : socle (étapes 1 à 10). PR intermédiaire vers `main` après l'étape 7, PR finale après l'étape 10.
Branche de travail : `claude/architecture-plan-validation-htyub0`.
- [x] 1. Socle (Vite, React, TS strict, ESLint, Vitest, CSP au build, dark mode, HashRouter)
- [x] 2. CI (lint, types, tests, scan, build) + scan anti-données personnelles + workflow Pages (main uniquement)
- [x] 3. crypto/ : coffre à clé de données enveloppée (itérations stockées dans l'en-tête, `rewrapVault`
  sans ré-encrypter les données), AES-GCM, page `/#/outils/crypto` de mesure. Détails : `docs/crypto.md`.
  Reste à faire par l'utilisateur : mesurer sur téléphone et Mac ancien (possible après publication).
- [x] 4. storage/ : IndexedDB chiffrée (`EncryptedStore`), migrations avec retour arrière, sauvegarde/restauration
  vérifiée, bouton « Sauvegarder maintenant » + rappel alimenté par toute écriture, verrouillage auto 5 min
  (`app/idleLock.ts`), écran de création/déverrouillage/restauration. Détails : `docs/storage.md`.
  Vérifié en vrai navigateur sous la CSP (création, téléchargement, verrouillage, rechargement).
  Reste à tester sur appareils réels : téléchargement de la sauvegarde sur iPhone/Safari.
- [ ] 5. domain/ (types) + connectors/
- [ ] 6. Assistant de premier lancement + réglages
- [ ] 7. import/pdf-ca (+ mode diagnostic + export de structure anonymisé) → PR intermédiaire
- [ ] 8. import/csv, ofx, dedupe
- [ ] 9. categorize/
- [ ] 10. Clôture 1A → PR finale
