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

## Avancement
Phase 1A : socle (étapes 1 à 10). PR intermédiaire vers `main` après l'étape 7, PR finale après l'étape 10.
Branche de travail : `claude/architecture-plan-validation-htyub0`.
- [x] 1. Socle (Vite, React, TS strict, ESLint, Vitest, CSP au build, dark mode, HashRouter)
- [ ] 2. CI + scan anti-données personnelles + workflow Pages
- [ ] 3. crypto/ (PBKDF2 : itérations stockées avec le vérificateur, mesure sur appareil lent à documenter)
- [ ] 4. storage/ (bouton « Sauvegarder maintenant » visible + rappel après chaque import)
- [ ] 5. domain/ (types) + connectors/
- [ ] 6. Assistant de premier lancement + réglages
- [ ] 7. import/pdf-ca (+ mode diagnostic + export de structure anonymisé) → PR intermédiaire
- [ ] 8. import/csv, ofx, dedupe
- [ ] 9. categorize/
- [ ] 10. Clôture 1A → PR finale
