import { Route, Routes } from 'react-router-dom';
import { CryptoBench } from '../ui/CryptoBench';

function Accueil() {
  return (
    <main className="page">
      <h1>Finances</h1>
      <p className="muted">
        Application 100 % locale : vos données restent chiffrées dans ce navigateur.
      </p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Accueil />} />
      <Route path="/outils/crypto" element={<CryptoBench />} />
    </Routes>
  );
}
