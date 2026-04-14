import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLeagueData } from '../services/dataStore';
import MatchCard from '../components/calendrier/MatchCard';
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

  const getZone = (pos) => {
    if (pos <= 8)  return styles.zoneGreen;
    if (pos <= 14) return styles.zoneOrange;
    return styles.zoneRed;
  };

  return (
    <div className={styles.miniTable}>
      {enriched.map(s => (
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
      ))}
    </div>
  );
}

export default function HomePage() {
  const { matches, standings, teams, loading, error, fileInfo } = useLeagueData();

  const upcoming = useMemo(() =>
    matches
      .filter(m => m.status === 'upcoming')
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3),
    [matches]
  );

  const recentResults = useMemo(() =>
    matches
      .filter(m => m.status === 'played')
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
    <div className={styles.page}>
      <div className="container">

        {/* Hero */}
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

        <div className={styles.grid}>

          {/* Prochains matchs */}
          <section className={styles.widget}>
            <div className={styles.widgetHeader}>
              <h2 className={styles.widgetTitle}>Prochains matchs</h2>
              <Link to="/qualification" className={styles.widgetLink}>Voir tout →</Link>
            </div>
            {upcoming.length > 0 ? (
              <div className={styles.matchList}>
                {upcoming.map((m, i) => <MatchCard key={m.id ?? i} match={m} />)}
              </div>
            ) : (
              <p className={styles.empty}>Aucun match à venir.</p>
            )}
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
                  style={{ background: 'var(--color-zone-orange)' }} />
                9e–14e
              </span>
              <span>
                <span className={styles.legendDot}
                  style={{ background: 'var(--color-zone-red)' }} />
                Barragistes
              </span>
            </div>
            <MiniStandings standings={standings} teams={teams} />
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
  );
}
