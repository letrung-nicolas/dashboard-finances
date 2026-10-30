// Usage : npm run scan            (dépôt entier : fichiers suivis + nouveaux non ignorés)
//         npm run scan -- --staged (contenu indexé, pour le hook pre-commit)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { forbiddenDataFile, scanText } from './scan-lib';

const staged = process.argv.indexOf('--staged') !== -1;

function git(args: string[]): Buffer {
  return execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 });
}

const listArgs = staged
  ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
  : ['ls-files', '-co', '--exclude-standard', '-z'];
const paths = git(listArgs)
  .toString('utf8')
  .split('\0')
  .filter((p) => p.length > 0 && p !== 'package-lock.json');

let failures = 0;
for (const path of paths) {
  if (forbiddenDataFile(path)) {
    console.error(`[scan] fichier de données interdit : ${path}`);
    failures++;
    continue;
  }
  const content = staged ? git(['show', ':' + path]) : readFileSync(path);
  if (content.indexOf(0) !== -1) continue; // binaire : seul le contrôle d'extension s'applique
  for (const f of scanText(content.toString('utf8'))) {
    // La valeur trouvée n'est jamais affichée (journaux de CI publics).
    console.error(`[scan] ${f.kind} probable : ${path}:${f.line}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`[scan] ${failures} problème(s). Retirez la donnée du dépôt (et de l'historique si déjà commitée).`);
  process.exit(1);
}
console.log(`[scan] OK : ${paths.length} fichier(s) vérifiés.`);
