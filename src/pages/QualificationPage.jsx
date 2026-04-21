import { useState, useMemo, useEffect } from 'react';
import { useLeagueData } from '../services/dataStore';
import JourneeSection from '../components/calendrier/JourneeSection';
import CalendrierFilters from '../components/calendrier/CalendrierFilters';
import { normalizeTeamName } from '../config/teams';
import styles from './QualificationPage.module.css';

export default function QualificationPage() {
  const { matches, teams, loadSupabaseScores } = useLeagueData();
  const [filters, setFilters] = useState({ team: '', group: '', venue: '', status: '' });

  // Rafraîchir les scores/statuts toutes les 30s
  useEffect(() => {
    const id = setInterval(() => loadSupabaseScores(), 30_000);
    return () => clearInterval(id);
  }, [loadSupabaseScores]);

  const groupMatches = useMemo(() => matches.filter(m => m.journee !== null), [matches]);

  const filtered = useMemo(() => {
    return groupMatches.filter(m => {
      if (filters.team) {
        const t = normalizeTeamName(filters.team);
        if (normalizeTeamName(m.teamA) !== t && normalizeTeamName(m.teamB) !== t) return false;
      }
      if (filters.group && m.group !== filters.group) return false;
      if (filters.venue && m.venue?.trim() !== filters.venue) return false;
      if (filters.status && m.status !== filters.status) return false;
      return true;
    });
  }, [groupMatches, filters]);

  const byJournee = useMemo(() => {
    const map = new Map();
    for (const m of filtered) {
      const j = m.journee || 0;
      if (!map.has(j)) map.set(j, []);
      map.get(j).push(m);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const played = groupMatches.filter(m => m.status === 'played').length;

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.pageHeader}>
          <div className={styles.badge}>Phase de groupes</div>
          <h1 className={styles.title}>Qualification</h1>
          <p className={styles.sub}>
            {groupMatches.length} matchs · {played} joués · Groupes A &amp; B · 15 mai – 11 juillet 2026
          </p>
        </div>

        <CalendrierFilters teams={teams} filters={filters} onChange={setFilters} />

        {byJournee.length === 0 ? (
          <div className={styles.empty}>Aucun match ne correspond aux filtres sélectionnés.</div>
        ) : (
          byJournee.map(([journee, jMatches]) => (
            <JourneeSection key={journee} journee={journee} matches={jMatches} />
          ))
        )}
      </div>
    </div>
  );
}
