import { useState, useMemo } from 'react';
import { useLeagueData } from '../services/dataStore';
import JourneeSection from '../components/calendrier/JourneeSection';
import CalendrierFilters from '../components/calendrier/CalendrierFilters';
import MatchCard from '../components/calendrier/MatchCard';
import { normalizeTeamName } from '../config/teams';
import styles from './CalendrierPage.module.css';

// Ordre canonique des rondes de phase finale
const ROUND_ORDER = ['1/8e de finale', 'Quarts de finale', 'Demi-finales', 'Finale'];

export default function CalendrierPage() {
  const { matches, teams } = useLeagueData();

  const [filters, setFilters] = useState({
    team: '', group: '', venue: '', status: '',
  });

  const applyFilters = (list) => list.filter(m => {
    if (filters.team) {
      const t = normalizeTeamName(filters.team);
      if (normalizeTeamName(m.teamA) !== t && normalizeTeamName(m.teamB) !== t) return false;
    }
    if (filters.group && m.group !== filters.group) return false;
    if (filters.venue && m.venue?.trim() !== filters.venue) return false;
    if (filters.status && m.status !== filters.status) return false;
    return true;
  });

  // Phase de groupes
  const byJournee = useMemo(() => {
    const filtered = applyFilters(matches.filter(m => m.journee !== null));
    const map = new Map();
    for (const m of filtered) {
      const j = m.journee || 0;
      if (!map.has(j)) map.set(j, []);
      map.get(j).push(m);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches, filters]);

  // Phase finale
  const byRound = useMemo(() => {
    const filtered = applyFilters(matches.filter(m => m.phase));
    const map = new Map();
    for (const m of filtered) {
      if (!map.has(m.phase)) map.set(m.phase, []);
      map.get(m.phase).push(m);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = ROUND_ORDER.indexOf(a[0]);
      const ib = ROUND_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [matches, filters]);

  const totalGroupes     = matches.filter(m => m.journee !== null).length;
  const totalPhaseFinale = matches.filter(m => m.phase).length;

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.title}>Calendrier 2026</h1>
        <p className={styles.sub}>
          Saison du 15 mai 2026 · {totalGroupes} matchs de groupe · {totalPhaseFinale} matchs de phase finale
        </p>

        <CalendrierFilters teams={teams} filters={filters} onChange={setFilters} />

        {byJournee.length === 0 && byRound.length === 0 ? (
          <div className={styles.empty}>
            Aucun match ne correspond aux filtres sélectionnés.
          </div>
        ) : (
          <>
            {/* Phase de groupes */}
            {byJournee.map(([journee, jMatches]) => (
              <JourneeSection key={journee} journee={journee} matches={jMatches} />
            ))}

            {/* Phase finale */}
            {byRound.length > 0 && (
              <section className={styles.phaseFinale}>
                <div className={styles.phaseHeader}>
                  <h2 className={styles.phaseTitle}>🏆 Phase finale — Coupe des Nations</h2>
                  <p className={styles.phaseSub}>À partir du 17 juillet 2026 · CHAUVEAU · VANIER</p>
                </div>

                {byRound.map(([round, rMatches]) => (
                  <div key={round} className={styles.roundSection}>
                    <h3 className={styles.roundTitle}>{round}</h3>
                    <div className={styles.roundGrid}>
                      {rMatches.map((m, i) => (
                        <MatchCard key={`${round}-${i}`} match={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
