import { useMemo } from 'react';
import { useLeagueData } from '../services/dataStore';
import MatchCard from '../components/calendrier/MatchCard';
import styles from './FinalePage.module.css';

const ROUND_ORDER = ['1/8e de finale', 'Quarts de finale', 'Demi-finales', 'Finale'];

const ROUND_ICONS = {
  '1/8e de finale':  '⚔️',
  'Quarts de finale': '🔥',
  'Demi-finales':    '⭐',
  'Finale':          '🏆',
};

export default function FinalePage() {
  const { matches } = useLeagueData();

  const byRound = useMemo(() => {
    const map = new Map();
    for (const m of matches.filter(m => m.phase)) {
      if (!map.has(m.phase)) map.set(m.phase, []);
      map.get(m.phase).push(m);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = ROUND_ORDER.indexOf(a[0]);
      const ib = ROUND_ORDER.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [matches]);

  const total = matches.filter(m => m.phase).length;

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.pageHeader}>
          <div className={styles.badge}>Coupe des Nations</div>
          <h1 className={styles.title}>Phase Finale</h1>
          <p className={styles.sub}>
            {total} matchs · À partir du 17 juillet 2026 · Complexe Chauveau
          </p>
        </div>

        {byRound.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🏆</span>
            <p>Les matchs de phase finale seront affichés ici après la phase de qualification.</p>
          </div>
        ) : (
          byRound.map(([round, rMatches]) => (
            <div key={round} className={styles.roundSection}>
              <div className={styles.roundHeader}>
                <span className={styles.roundIcon}>{ROUND_ICONS[round] ?? '⚽'}</span>
                <h2 className={styles.roundTitle}>{round}</h2>
                <span className={styles.roundCount}>{rMatches.length} match{rMatches.length > 1 ? 's' : ''}</span>
              </div>
              <div className={styles.roundGrid}>
                {rMatches.map((m, i) => (
                  <MatchCard key={`${round}-${i}`} match={m} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
