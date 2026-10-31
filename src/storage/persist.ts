/**
 * Demande au navigateur de ne pas purger le stockage de lui-même. Sans garantie : Safari, en
 * particulier, peut effacer les données d'un site peu visité. La sauvegarde reste indispensable.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // sans effet : pas de repli possible
  }
  return false;
}
