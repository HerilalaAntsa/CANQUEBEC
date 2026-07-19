import { useMemo, useEffect, useState } from 'react';
import { useLeagueData } from '../services/dataStore';
import MatchCard from '../components/calendrier/MatchCard';
import BracketView, { buildBracket } from '../components/finale/BracketView';
import styles from './FinalePage.module.css';

const ROUND_ICONS = {
  '1/8e de finale':   '',
  'Quarts de finale': '',
  'Demi-finales':     '',
  'Finale':           '',
};

const ROUND_LABELS = {
  '1/8e de finale':   '1/8 de finale',
  'Quarts de finale': 'Quarts de finale',
  'Demi-finales':     'Demi-finales',
  'Finale':           '🏆 Grande Finale',
  '3e place':         '🥉 Match pour la 3e place',
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

  // Groupement par round → par date (pour la vue liste).
  // buildBracket projette automatiquement les gagnants dans les tours suivants :
  // les admins n'ont qu'à saisir les scores des 1/8, les quarts se remplissent seuls.
  const byRound = useMemo(() => {
    const b = buildBracket(phaseMatches);
    const rounds = [
      { round: '1/8e de finale',   matches: b.r16 },
      { round: 'Quarts de finale', matches: b.qf },
      { round: 'Demi-finales',     matches: b.sf },
      { round: 'Finale',           matches: [b.finale].filter(Boolean) },
      { round: '3e place',         matches: [b.third].filter(Boolean) },
    ];
    return rounds.map(({ round, matches: rMatches }) => {
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
                Liste
              </button>
              <button
                className={`${styles.toggleBtn} ${view === 'bracket' ? styles.toggleActive : ''}`}
                onClick={() => setView('bracket')}
              >
                Arbre
              </button>
            </div>

            {/* ── Vue liste : MatchCards groupées par round puis par date ── */}
            {view === 'list' && byRound.map(({ round, byDate }) => (
              <div key={round} className={styles.roundSection}>
                <div className={styles.roundHeader}>
                  <h2 className={styles.roundTitle}>{ROUND_LABELS[round] ?? round}</h2>
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
