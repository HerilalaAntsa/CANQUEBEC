import { useParams, Link } from 'react-router-dom';
import { useTeam } from '../hooks/useTeam';
import { useLeagueData } from '../services/dataStore';
import FlagBadge from '../components/shared/FlagBadge';
import MatchCard from '../components/calendrier/MatchCard';
import SortableTable from '../components/shared/SortableTable';
import { POSITION_LABELS } from '../config/teams';
import styles from './EquipePage.module.css';

const ROSTER_COLS = [
  { key: 'number',   label: '#',      sortable: true,  align: 'right' },
  { key: 'name',     label: 'Joueur', sortable: true },
  { key: 'position', label: 'Poste',  sortable: true,
    render: (v) => v ?? '—'
  },
  { key: 'goals',   label: '⚽',  sortable: true, align: 'right' },
  { key: 'assists', label: '🎯',  sortable: true, align: 'right' },
];

function StatBadge({ label, value, accent }) {
  return (
    <div className={styles.stat}>
      <span className={`${styles.statValue} ${accent ? styles.accent : ''}`}>{value ?? 0}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export default function EquipePage() {
  const { slug } = useParams();
  const { loading } = useLeagueData();
  const teamData = useTeam(slug);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className="container">
          <div className={`skeleton ${styles.skeletonHeader}`} />
        </div>
      </div>
    );
  }

  if (!teamData) {
    return (
      <div className={styles.page}>
        <div className="container">
          <div className={styles.notFound}>
            <p>⚠️ Équipe introuvable.</p>
            <Link to="/equipes" className={styles.backLink}>← Voir toutes les équipes</Link>
          </div>
        </div>
      </div>
    );
  }

  const { team, name, standing, teamMatches, roster, topScorers, meta } = teamData;
  const played   = teamMatches.filter(m => m.status === 'played');
  const upcoming = teamMatches.filter(m => m.status === 'upcoming');

  return (
    <div className={styles.page}>
      <div className="container">

        {/* Header */}
        <div className={styles.header}>
          <FlagBadge team={name} size="xl" />
          <div className={styles.headerMeta}>
            <span className={styles.groupBadge}>Groupe {team.group}</span>
            {meta?.captain && <span className={styles.metaItem}>👑 {meta.captain}</span>}
            {meta?.coach   && <span className={styles.metaItem}>🏋️ Coach: {meta.coach}</span>}
          </div>
        </div>

        {/* Stats clés */}
        {standing && (
          <div className={styles.statsRow}>
            <StatBadge label="Matchs" value={standing.played} />
            <StatBadge label="Victoires" value={standing.won} accent />
            <StatBadge label="Nuls" value={standing.drawn} />
            <StatBadge label="Défaites" value={standing.lost} />
            <StatBadge label="Buts +" value={standing.goalsFor} />
            <StatBadge label="Buts -" value={standing.goalsAgainst} />
            <StatBadge label="Points" value={standing.points} accent />
          </div>
        )}

        <div className={styles.cols}>
          {/* Roster */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Effectif ({roster.length} joueurs)</h2>
            {roster.length > 0 ? (
              <SortableTable
                columns={ROSTER_COLS}
                data={roster.map(p => ({ ...p, id: `${p.number}-${p.team}` }))}
                defaultSort="number"
                defaultDir="asc"
                rowKey="id"
                emptyMessage="Aucun joueur enregistré."
              />
            ) : (
              <p className={styles.empty}>Effectif non disponible.</p>
            )}
          </section>

          <div className={styles.rightCol}>
            {/* Prochains matchs */}
            {upcoming.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Prochains matchs</h2>
                <div className={styles.matchList}>
                  {upcoming.slice(0, 5).map((m, i) => (
                    <MatchCard key={m.id ?? i} match={m} />
                  ))}
                </div>
              </section>
            )}

            {/* Résultats */}
            {played.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Résultats</h2>
                <div className={styles.matchList}>
                  {[...played].reverse().slice(0, 5).map((m, i) => (
                    <MatchCard key={m.id ?? i} match={m} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <Link to="/equipes" className={styles.backLink}>← Toutes les équipes</Link>
      </div>
    </div>
  );
}
