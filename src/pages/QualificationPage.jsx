import { useState, useMemo, useEffect } from 'react';
import { useLeagueData } from '../services/dataStore';
import JourneeSection from '../components/calendrier/JourneeSection';
import CalendrierFilters from '../components/calendrier/CalendrierFilters';
import { normalizeTeamName } from '../config/teams';
import styles from './QualificationPage.module.css';

export default function QualificationPage() {
  const { matches, teams, loadSupabaseScores } = useLeagueData();
  const [filters, setFilters] = useState({ team: '', group: '', venue: '', status: '', referee: '', journee: '' });

  // Rafraîchir les scores/statuts toutes les 30s
  useEffect(() => {
    const id = setInterval(() => loadSupabaseScores(), 30_000);
    return () => clearInterval(id);
  }, [loadSupabaseScores]);

  const groupMatches = useMemo(() => matches.filter(m => m.journee !== null), [matches]);

  // Liste unique d'arbitres
  const referees = useMemo(() => {
    const set = new Set();
    for (const m of groupMatches) {
      if (m.referee?.trim()) set.add(m.referee.trim());
    }
    return [...set].sort();
  }, [groupMatches]);

  // Liste unique de terrains
  const venues = useMemo(() => {
    const set = new Set();
    for (const m of groupMatches) {
      if (m.venue?.trim()) set.add(m.venue.trim());
    }
    return [...set].sort();
  }, [groupMatches]);

  // Liste des journées disponibles
  const journees = useMemo(() =>
    [...new Set(groupMatches.map(m => m.journee).filter(Boolean))].sort((a, b) => a - b)
  , [groupMatches]);

  const filtered = useMemo(() => {
    return groupMatches.filter(m => {
      if (filters.team) {
        const t = normalizeTeamName(filters.team);
        if (normalizeTeamName(m.teamA) !== t && normalizeTeamName(m.teamB) !== t) return false;
      }
      if (filters.group && m.group !== filters.group) return false;
      if (filters.venue && m.venue?.trim() !== filters.venue) return false;
      if (filters.status) {
        const isMatch = filters.status === 'played'
          ? ['played', 'forfait_a', 'forfait_b'].includes(m.status)
          : m.status === filters.status;
        if (!isMatch) return false;
      }
      if (filters.referee && m.referee?.trim() !== filters.referee) return false;
      if (filters.journee && String(m.journee) !== filters.journee) return false;
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
    // Ordre décroissant : matchs les plus récents en haut (dans chaque journée)
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ka = `${a.date ?? ''}T${a.time ?? ''}`;
        const kb = `${b.date ?? ''}T${b.time ?? ''}`;
        return ka > kb ? -1 : ka < kb ? 1 : 0;
      });
    }
    // ... et journées les plus récentes en haut
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const played = groupMatches.filter(m => ['played', 'forfait_a', 'forfait_b'].includes(m.status)).length;

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

        <CalendrierFilters teams={teams} referees={referees} venues={venues} journees={journees} filters={filters} onChange={setFilters} />

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
