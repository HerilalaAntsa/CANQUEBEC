import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider, useLeagueData } from './services/dataStore';
import AppShell from './components/layout/AppShell';
import HomePage from './pages/HomePage';
import QualificationPage from './pages/QualificationPage';
import FinalePage from './pages/FinalePage';
import ClassementPage from './pages/ClassementPage';
import StatsPage from './pages/StatsPage';
import EquipePage from './pages/EquipePage';
import EquipesPage from './pages/EquipesPage';

const EXCEL_HORAIRE_URL   = '/data/HORAIRE_2026.xlsx';
const EXCEL_PLAYERS_A_URL = '/data/LISTE_GROUPE_A.xlsx';
const EXCEL_PLAYERS_B_URL = '/data/LISTE_GROUPE_B.xlsx';

function DataLoader({ children }) {
  const { loadHoraire, loadPlayers } = useLeagueData();

  useEffect(() => {
    loadHoraire(EXCEL_HORAIRE_URL);
  }, [loadHoraire]);

  useEffect(() => {
    loadPlayers(EXCEL_PLAYERS_A_URL, EXCEL_PLAYERS_B_URL);
  }, [loadPlayers]);

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <DataLoader>
          <AppShell>
            <Routes>
              <Route path="/"               element={<HomePage />} />
              <Route path="/qualification"  element={<QualificationPage />} />
              <Route path="/finale"         element={<FinalePage />} />
              <Route path="/classement"     element={<ClassementPage />} />
              <Route path="/stats"          element={<StatsPage />} />
              <Route path="/equipes"        element={<EquipesPage />} />
              <Route path="/equipe/:slug"   element={<EquipePage />} />
              {/* Ancienne URL redirigée */}
              <Route path="/calendrier"     element={<Navigate to="/qualification" replace />} />
              <Route path="*" element={
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <h2>404 — Page introuvable</h2>
                  <a href="/" style={{ color: 'var(--color-accent)' }}>← Retour à l&apos;accueil</a>
                </div>
              } />
            </Routes>
          </AppShell>
        </DataLoader>
      </DataProvider>
    </BrowserRouter>
  );
}
