import { Route, Routes } from 'react-router-dom';
import { BackupBar } from '../ui/BackupBar';
import { CryptoBench } from '../ui/CryptoBench';
import { LockScreen } from '../ui/LockScreen';
import { SessionProvider, useSession } from './session';

function Accueil() {
  return (
    <main className="page">
      <BackupBar />
      <h1>Finances</h1>
      <p className="muted">
        Application 100 % locale : vos données restent chiffrées dans ce navigateur.
      </p>
    </main>
  );
}

/** Tout, sauf la page de mesure, exige un coffre déverrouillé. */
function Gate() {
  const { status } = useSession();
  return status === 'unlocked' ? <Accueil /> : <LockScreen />;
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/outils/crypto" element={<CryptoBench />} />
        <Route path="*" element={<Gate />} />
      </Routes>
    </SessionProvider>
  );
}
