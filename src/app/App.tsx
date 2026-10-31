import { Link, Route, Routes } from 'react-router-dom';
import { BackupBar } from '../ui/BackupBar';
import { CryptoBench } from '../ui/CryptoBench';
import { LockScreen } from '../ui/LockScreen';
import { SettingsPage } from '../ui/SettingsPage';
import { Wizard } from '../ui/Wizard';
import { SessionProvider, useSession } from './session';

function Accueil() {
  return (
    <>
      <h1>Finances</h1>
      <p className="muted">
        Vos réglages sont enregistrés. Prochaine étape du projet : l'import de vos relevés, puis le tableau de bord.
      </p>
    </>
  );
}

function Shell() {
  return (
    <main className="page">
      <BackupBar />
      <nav className="nav">
        <Link to="/">Accueil</Link>
        <Link to="/reglages">Réglages</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/reglages" element={<SettingsPage />} />
        <Route path="*" element={<Accueil />} />
      </Routes>
    </main>
  );
}

/** Tout, sauf la page de mesure, exige un coffre déverrouillé. */
function Gate() {
  const { status, settingsState } = useSession();
  if (status !== 'unlocked') return <LockScreen />;
  if (settingsState === 'loading') return <main className="page"><p>Chargement…</p></main>;
  if (settingsState === 'missing') return <Wizard />;
  return <Shell />;
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
