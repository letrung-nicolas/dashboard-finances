import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CryptoError } from '../crypto';
import { backupFileName, EncryptedStore, requestPersistence, StorageError } from '../storage';
import type { BackupState } from '../storage';
import { downloadTextFile } from '../ui/download';
import { IDLE_TIMEOUT_MS, IdleTimer } from './idleLock';

export type SessionStatus = 'loading' | 'no-vault' | 'locked' | 'unlocked' | 'error';

export interface Session {
  status: SessionStatus;
  /** Disponible seulement quand le coffre est déverrouillé. */
  store: EncryptedStore | null;
  backup: BackupState;
  error: string | null;
  createVault(password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  restore(fileText: string, password: string): Promise<void>;
  /** Génère et télécharge le fichier de sauvegarde chiffré. */
  backupNow(): Promise<void>;
}

const EMPTY_BACKUP: BackupState = { lastBackupAt: null, changesSinceBackup: 0 };

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return value;
}

/** Message lisible en français pour une erreur de stockage ou de chiffrement. */
export function messageFor(e: unknown): string {
  if (e instanceof CryptoError) {
    if (e.code === 'WRONG_PASSWORD') return 'Mot de passe incorrect.';
    if (e.code === 'WEAK_PASSWORD') return e.message;
    return e.message;
  }
  if (e instanceof StorageError) return e.message;
  return 'Une erreur inattendue est survenue.';
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupState>(EMPTY_BACKUP);
  const storeRef = useRef<EncryptedStore | null>(null);
  const [store, setStore] = useState<EncryptedStore | null>(null);
  const idleRef = useRef<IdleTimer | null>(null);

  // Ouverture de la base au démarrage.
  useEffect(() => {
    let cancelled = false;
    EncryptedStore.open()
      .then(async (s) => {
        if (cancelled) return;
        storeRef.current = s;
        s.subscribe(() => {
          setBackup(s.isUnlocked ? s.getBackupState() : EMPTY_BACKUP);
          setStore(s.isUnlocked ? s : null);
          if (!s.isUnlocked) setStatus((cur) => (cur === 'unlocked' ? 'locked' : cur));
        });
        setStatus((await s.hasVault()) ? 'locked' : 'no-vault');
      })
      .catch((e) => {
        if (cancelled) return;
        setError(messageFor(e));
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lock = useCallback(() => {
    if (idleRef.current) idleRef.current.stop();
    if (storeRef.current) storeRef.current.lock();
    setStatus((cur) => (cur === 'unlocked' ? 'locked' : cur));
  }, []);

  // Verrouillage automatique après 5 minutes d'inactivité (et au retour d'une mise en veille).
  useEffect(() => {
    if (status !== 'unlocked') return;
    const timer = new IdleTimer(IDLE_TIMEOUT_MS, lock);
    idleRef.current = timer;
    timer.start();
    const touch = () => timer.touch();
    const check = () => {
      if (document.visibilityState === 'visible') timer.check();
    };
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      timer.stop();
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, touch));
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [status, lock]);

  const afterUnlock = useCallback((s: EncryptedStore) => {
    setBackup(s.getBackupState());
    setStore(s);
    setError(null);
    setStatus('unlocked');
    void requestPersistence();
  }, []);

  const requireStore = (): EncryptedStore => {
    if (!storeRef.current) throw new StorageError('IDB_UNAVAILABLE', 'Stockage non initialisé.');
    return storeRef.current;
  };

  const createVault = useCallback(
    async (password: string) => {
      const s = requireStore();
      await s.createVault(password);
      afterUnlock(s);
    },
    [afterUnlock],
  );

  const unlock = useCallback(
    async (password: string) => {
      const s = requireStore();
      await s.unlock(password);
      afterUnlock(s);
    },
    [afterUnlock],
  );

  const restore = useCallback(
    async (fileText: string, password: string) => {
      const s = requireStore();
      await s.restoreBackup(fileText, password);
      await s.unlock(password);
      afterUnlock(s);
    },
    [afterUnlock],
  );

  const backupNow = useCallback(async () => {
    const s = requireStore();
    const text = await s.exportBackup();
    downloadTextFile(backupFileName(Date.now()), text);
  }, []);

  const value = useMemo<Session>(
    () => ({ status, store, backup, error, createVault, unlock, lock, restore, backupNow }),
    [status, store, backup, error, createVault, unlock, lock, restore, backupNow],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
