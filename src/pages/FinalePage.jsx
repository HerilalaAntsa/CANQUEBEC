import { useMemo, useEffect, useState } from 'react';
import { useLeagueData } from '../services/dataStore';
import MatchCard from '../components/calendrier/MatchCard';
import BracketView, { ROUND_KEYS } from '../components/finale/BracketView';
import styles from './FinalePage.module.css';

const ROUND_ICONS = {
  '1/8e de finale':   '⚔️',
  'Quarts de finale': '🔥',
  'Demi-finales':     '⭐',
  'Finale':           '🏆',
};

function formatDateHeader(dateStr) {
  if (!dateStr) return 'Date à confirmer';
  // Normalise : accepte string ISO ou objet Date
  const d = dateStr instanceof Date ? dateStr : new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('fr-CA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function FinalePage() {
  const { matches, loadSupabaseScores } = useLeagueData();
  const [view, setView] = useState('list');

  useEffect(() => {
    const id = setInterval(() => loadSupabaseScores(), 30_000);
    return () => clearInterval(id);
  }, [loadSupabaseScores]);

  // Matches de phase finale uniquement
  const phaseMatches = useMemo(
    () => matches.filter(m => m.phase),
    [matches],
  );

  // Groupement par round → par date (pour la vue liste)
  const byRound = useMemo(() => {
    const roundMap = new Map();
    for (const m of phaseMatches) {
      if (!roundMap.has(m.phase)) roundMap.set(m.phase, []);
      roundMap.get(m.phase).push(m);
    }

    return [...roundMap.entries()]
      .sort((a, b) => {
        const ia = ROUND_KEYS.indexOf(a[0]);
        const ib = ROUND_KEYS.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([round, rMatches]) => {
        // Sous-groupe par date
        const dateMap = new Map();
        const sorted = [...rMatches].sort((a, b) => {
          const ka = `${a.date ?? '9999'}${a.time ?? '99:99'}`;
          const kb = `${b.date ?? '9999'}${b.time ?? '99:99'}`;
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
        for (const m of sorted) {
          const key = m.date ?? 'unknown';
          if (!dateMap.has(key)) dateMap.set(key, []);
          dateMap.get(key).push(m);
        }
        return { round, byDate: [...dateMap.entries()] };
      });
  }, [phaseMatches]);

  const total = phaseMatches.length;

  return (
    <div className={styles.page}>
      <div className="container">

        <div className={styles.pageHeader}>
          <div className={styles.badge}>Coupe des Nations</div>
          <h1 className={styles.title}>Phase Finale</h1>
          <p className={styles.sub}>{total} matchs · À partir du 17 juillet 2026</p>
        </div>

        {phaseMatches.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🏆</span>
            <p>Les matchs de phase finale seront affichés ici après la phase de qualification.</p>
          </div>
        ) : (
          <>
            <div className={styles.viewToggle}>
              <button
                className={`${styles.toggleBtn} ${view === 'list' ? styles.toggleActive : ''}`}
                onClick={() => setView('list')}
              >
                📋 Liste
              </button>
              <button
                className={`${styles.toggleBtn} ${view === 'bracket' ? styles.toggleActive : ''}`}
                onClick={() => setView('bracket')}
              >
                🌳 Arbre
              </button>
            </div>

            {/* ── Vue liste : MatchCards groupées par round puis par date ── */}
            {view === 'list' && byRound.map(({ round, byDate }) => (
              <div key={round} className={styles.roundSection}>
                <div className={styles.roundHeader}>
                  <span className={styles.roundIcon}>{ROUND_ICONS[round] ?? '⚽'}</span>
                  <h2 className={styles.roundTitle}>{round}</h2>
                </div>

                {byDate.map(([dateKey, dayMatches]) => (
                  <div key={dateKey} className={styles.dateGroup}>
                    <div className={styles.dateHeader}>
                      📅 {formatDateHeader(dateKey)}
                    </div>
                    <div className={styles.roundGrid}>
                      {dayMatches.map((m, i) => (
                        <MatchCard key={`${dateKey}-${i}`} match={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* ── Vue arbre ── */}
            {view === 'bracket' && (
              <div className={styles.bracketWrapper}>
                <BracketView matches={phaseMatches} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
