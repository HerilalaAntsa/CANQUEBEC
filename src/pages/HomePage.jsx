import { useMemo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeagueData } from '../services/dataStore';
import MatchCard from '../components/calendrier/MatchCard';
import BracketView from '../components/finale/BracketView';
import FlagBadge from '../components/shared/FlagBadge';
import { generateSlug } from '../config/teams';
import styles from './HomePage.module.css';

function MiniStandings({ standings, teams }) {
  const enriched = useMemo(() =>
    standings
      .map(s => ({ ...s, group: teams.find(t => t.name === s.team)?.group ?? '' }))
      .filter(s => s.group)
      .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
      .map((s, i) => ({ ...s, pos: i + 1 })),
    [standings, teams]
  );

  if (!enriched.length) return <p className={styles.empty}>À venir</p>;

  const total = enriched.length;
  const top4  = enriched.slice(0, 4);
  const bot4  = enriched.slice(Math.max(4, total - 4));
  const showEllipsis = total > 8;

  const getZone = (pos) => {
    if (pos <= 8)  return styles.zoneGreen;
    if (pos <= 14) return styles.zoneNeutral;
    return styles.zoneRed;
  };

  const renderRow = (s) => (
    <Link
      key={s.team}
      to={'/equipe/' + generateSlug(s.team)}
      className={styles.miniRow + ' ' + getZone(s.pos)}
    >
      <span className={styles.miniPos}>{s.pos}</span>
      <span className={styles.miniGr}>{s.group}</span>
      <span className={styles.miniTeam}><FlagBadge team={s.team} size="sm" /></span>
      <span className={styles.miniPts}>{s.points} pts</span>
    </Link>
  );

  return (
    <div className={styles.miniTable}>
      {top4.map(renderRow)}
      {showEllipsis && (
        <div className={styles.miniEllipsis}>···</div>
      )}
      {bot4.map(renderRow)}
    </div>
  );
}

function PhaseFinaleWidget({ matches }) {
  const [view, setView] = useState('list');
  const phaseMatches = useMemo(() => matches.filter(m => m.phase), [matches]);

  if (!phaseMatches.length) return <p className={styles.empty}>Les matchs de phase finale apparaîtront ici.</p>;

  return (
    <div>
      <div className={styles.widgetToggle}>
        <button
          className={`${styles.wToggleBtn} ${view === 'list' ? styles.wToggleActive : ''}`}
          onClick={() => setView('list')}
        >Liste</button>
        <button
          className={`${styles.wToggleBtn} ${view === 'bracket' ? styles.wToggleActive : ''}`}
          onClick={() => setView('bracket')}
        >Arbre</button>
      </div>
      {view === 'list' && (
        <div className={styles.matchList}>
          {phaseMatches.slice(0, 4).map((m, i) => <MatchCard key={m.id ?? i} match={m} />)}
          {phaseMatches.length > 4 && (
            <Link to="/finale" className={styles.seeMore}>Voir tous les matchs ({phaseMatches.length}) →</Link>
          )}
        </div>
      )}
      {view === 'bracket' && (
        <div className={styles.bracketHome}>
          <BracketView matches={phaseMatches} />
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const { matches, standings, liveStandings, teams, loading, error, fileInfo, loadSupabaseScores, supabaseScores } = useLeagueData();

  // Rafraîchir les scores/statuts toutes les 30s
  useEffect(() => {
    const id = setInterval(() => loadSupabaseScores(), 30_000);
    return () => clearInterval(id);
  }, [loadSupabaseScores]);

  // Top buteurs — agrégés depuis supabaseScores
  const topScorers = useMemo(() => {
    const map = {};
    for (const [_key, match] of Object.entries(supabaseScores ?? {})) {
      if (_key.startsWith('teams:')) continue;
      for (const g of match.goals ?? []) {
        if (!g.player_name && !g.player_num) continue;
        const key = `${g.team}__${g.player_num ?? ''}__${g.player_name ?? ''}`;
        if (!map[key]) map[key] = { team: g.team, playerNum: g.player_num, playerName: g.player_name || `#${g.player_num}`, goals: 0 };
        map[key].goals++;
      }
    }
    return Object.values(map).sort((a, b) => b.goals - a.goals).slice(0, 5);
  }, [supabaseScores]);

  // Standings: live (Supabase) merged sur Excel pour avoir toutes les équipes
  const mergedStandings = useMemo(() => {
    if (liveStandings && liveStandings.length > 0) {
      const base = {};
      for (const s of standings) base[s.team] = { ...s };
      for (const s of liveStandings) base[s.team] = { ...(base[s.team] ?? {}), ...s };
      return Object.values(base);
    }
    return standings;
  }, [standings, liveStandings]);

  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seen = new Set();
    return matches
      .filter(m => {
        if (m.status !== 'upcoming' && m.status !== 'live') return false;
        if (m.scoreA != null && m.scoreB != null) return false;
        // Exclure matchs dont la date est passée mais pas encore à jour dans Supabase
        if (m.date) {
          const safe = String(m.date).length === 10 ? m.date + 'T00:00:00' : m.date;
          const matchDay = new Date(safe);
          matchDay.setHours(0, 0, 0, 0);
          if (matchDay < today) return false;
        }
        // Dédupliquer par équipes + date (double entrée Excel pour même match)
        const dedupeKey = `${m.teamA}|${m.teamB}|${m.date}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3);
  }, [matches]);

  const recentResults = useMemo(() =>
    matches
      .filter(m => ['played', 'forfait_a', 'forfait_b'].includes(m.status))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3),
    [matches]
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="container">
          <div className={styles.loadingWrap}>
            <div className={styles.spinner} />
            <p className={styles.loadingText}>Chargement des données…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className="container">
          <div className={styles.errorWrap}>
            <h2>Erreur de chargement</h2>
            <p>{error}</p>
            <p className={styles.errorHint}>
              Vérifiez que le fichier Excel est dans <code>/public/data/</code>
            </p>
            <div style={{ marginTop: '1rem' }}>
              <Link to="/" className={styles.ctaBtn}>Réessayer</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
        {/* Hero — full width bord-à-bord */}
        <div className={styles.heroWrap}>
          <div className="container">
            <div className={styles.hero}>
              <img src="/assets/logo.jpg" alt="QCN" className={styles.heroLogo}
                onError={(e) => { e.target.style.display = 'none'; }} />
              <div>
                <h1 className={styles.heroTitle}>Québec Coupe des Nations</h1>
                <p className={styles.heroSub}>
                  Saison 2026 · Vanier &amp; Neufchâtel · {teams.length} équipes
                </p>
              </div>
            </div>
          </div>
        </div>

    <div className={styles.page}>
      <div className="container">

        <div className={styles.grid}>

          {/* Phase Finale */}
          <section className={styles.widget}>
            <div className={styles.widgetHeader}>
              <h2 className={styles.widgetTitle}>Phase Finale</h2>
              <Link to="/finale" className={styles.widgetLink}>Voir tout →</Link>
            </div>
            <PhaseFinaleWidget matches={matches} />
          </section>

          {/* Derniers résultats */}
          <section className={styles.widget}>
            <div className={styles.widgetHeader}>
              <h2 className={styles.widgetTitle}>Derniers résultats</h2>
              <Link to="/qualification" className={styles.widgetLink}>Voir tout →</Link>
            </div>
            {recentResults.length > 0 ? (
              <div className={styles.matchList}>
                {recentResults.map((m, i) => <MatchCard key={m.id ?? i} match={m} />)}
              </div>
            ) : (
              <p className={styles.empty}>Saison pas encore commencée.</p>
            )}
          </section>

          {/* Top buteurs */}
          {topScorers.length > 0 && (
            <section className={styles.widget + ' ' + styles.widgetFull}>
              <div className={styles.widgetHeader}>
                <h2 className={styles.widgetTitle}>⚽ Top Buteurs</h2>
                <Link to="/stats" className={styles.widgetLink}>Voir tout →</Link>
              </div>
              <div className={styles.scorerList}>
                {topScorers.map((s, i) => (
                  <Link key={`${s.team}__${s.playerNum}__${s.playerName}`}
                    to={`/equipe/${generateSlug(s.team)}`}
                    className={styles.scorerRow}
                  >
                    <span className={styles.scorerRank}>{i + 1}</span>
                    <span className={styles.scorerTeam}><FlagBadge team={s.team} size="sm" /></span>
                    <span className={styles.scorerName}>
                      {s.playerNum && <span className={styles.scorerNum}>#{s.playerNum}</span>}
                      {s.playerName}
                    </span>
                    <span className={styles.scorerGoals}>{s.goals} ⚽</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Classement général */}
          <section className={styles.widget + ' ' + styles.widgetFull}>
            <div className={styles.widgetHeader}>
              <h2 className={styles.widgetTitle}>Classement général</h2>
              <Link to="/classement" className={styles.widgetLink}>Complet →</Link>
            </div>
            <div className={styles.miniLegend}>
              <span>
                <span className={styles.legendDot}
                  style={{ background: 'var(--color-zone-green)' }} />
                Top 8
              </span>
              <span>
                <span className={styles.legendDot}
                  style={{ background: 'rgba(180,180,180,0.3)' }} />
                9e–14e
              </span>
              <span>
                <span className={styles.legendDot}
                  style={{ background: 'var(--color-zone-red)' }} />
                Barragistes
              </span>
            </div>
            <MiniStandings standings={mergedStandings} teams={teams} />
          </section>

        </div>

        {fileInfo?.horaire && (
          <p className={styles.fileInfo}>
            Données : {fileInfo.horaire.name} · Chargé{' '}
            {new Date(fileInfo.horaire.loadedAt).toLocaleTimeString('fr-CA')}
          </p>
        )}

      </div>
    </div>
    </>
  );
}
