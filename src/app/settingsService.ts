import { base64ToBytes, bytesToBase64, bytesToHex, randomBytes } from '../crypto';
import type { ConnectorContext } from '../connectors';
import { emptyForm, formFromSettings, settingsFromForm } from '../domain';
import type { Settings, SettingsForm, SettingsResult } from '../domain';
import type { EncryptedStore } from '../storage';

const COLLECTION = 'settings';
const ID = 'main';
const SECRET_BYTES = 32;

export async function loadSettings(store: EncryptedStore): Promise<Settings | null> {
  const value = await store.get<Settings>(COLLECTION, ID);
  return value === undefined ? null : value;
}

export async function saveSettings(store: EncryptedStore, settings: Settings): Promise<void> {
  await store.put(COLLECTION, ID, settings);
}

/** Identifiant interne opaque (prêt à servir de préfixe lisible : jamais dérivé de données du compte). */
export function newId(prefix: string): string {
  return prefix + '-' + bytesToHex(randomBytes(8));
}

/** Premier lancement : crée le secret d'identifiants et valide le formulaire. */
export function createInitialSettings(form: SettingsForm): SettingsResult {
  return settingsFromForm(form, { idSecret: bytesToBase64(randomBytes(SECRET_BYTES)), accounts: {} });
}

/** Modification ultérieure : le secret et les comptes sont conservés tels quels. */
export function updateSettings(form: SettingsForm, current: Settings): SettingsResult {
  return settingsFromForm(form, { idSecret: current.idSecret, accounts: current.accounts });
}

export { emptyForm, formFromSettings };

/**
 * Contexte des connecteurs : le secret d'identifiants et la correspondance clé de compte -> identifiant.
 * Un compte nouveau reçoit un identifiant aléatoire, enregistré immédiatement dans les réglages.
 */
export function createConnectorContext(
  settings: Settings,
  persist: (next: Settings) => Promise<void>,
): { context: ConnectorContext; current(): Settings } {
  let state = settings;
  const context: ConnectorContext = {
    idSecret: base64ToBytes(settings.idSecret),
    async resolveAccountId(accountKey: string) {
      const known = state.accounts[accountKey];
      if (known !== undefined) return known;
      const id = newId('acc');
      state = { ...state, accounts: { ...state.accounts, [accountKey]: id } };
      await persist(state);
      return id;
    },
  };
  return { context, current: () => state };
}
