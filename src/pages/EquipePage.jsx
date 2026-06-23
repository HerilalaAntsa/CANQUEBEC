import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeagueData } from '../services/dataStore';
import { getSuspensionMap } from '../services/disciplineService';
import FlagBadge from '../components/shared/FlagBadge';
import MatchCard from '../components/calendrier/MatchCard';
import SortableTable from '../components/shared/SortableTable';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserTie } from '@fortawesome/free-solid-svg-icons';
import { POSITION_LABELS } from '../config/teams';
import { JerseyPanel } from '../components/shared/JerseyBadge';
import { getJerseys } from '../config/jerseyConfig';
import styles from './EquipePage.module.css';

function buildRosterCols(suspMap, stylesObj) {
  return [
    { key: 'number',   label: '#',      sortable: true,  align: 'right' },
    { key: 'name',     label: 'Joueur', sortable: true,
      render: (v, row) => {
        const info = suspMap[String(row.number)];
        return (
          <span style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
            {v}
            {info?.suspended && info.remaining > 0 && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem' }}>
                <span style={{ fontSize:'0.85rem', lineHeight:1 }}>🟥</span>
                <em className={stylesObj.suspText}>suspendu ({info.remaining} match{info.remaining > 1 ? 's' : ''})</em>
              </span>
            )}
          </span>
        );
      }
    },
    { key: 'position', label: 'Poste',  sortable: true,
      render: (v) => v ?? '—'
    },
    { key: 'goals',   label: '⚽',  sortable: true, align: 'right' },
    { key: 'assists', label: '🎯',  sortable: true, align: 'right' },
  ];
}

function buildBannedCols(stylesObj) {
  return [
    { key: 'number',   label: '#',      sortable: false,  align: 'right',
      render: () => <span className={stylesObj.banniBadgeNum}>BANNI</span>
    },
    { key: 'name',     label: 'Joueur', sortable: true,
      render: (v, row) => (
        <span style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
          <span className={stylesObj.bannedName}>{v}</span>
          {row.notes && <em style={{ fontSize:'0.7rem', color:'var(--color-text-muted)' }}>{row.notes}</em>}
        </span>
      )
    },
    { key: 'position', label: 'Poste',  sortable: false,
      render: (v) => v ?? '—'
    },
  ];
}

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

  // ⚠️ Hooks TOUJOURS avant les return conditionnels
  const [suspMap, setSuspMap] = useState({}); // { playerNum: matches_remaining }
  const [matchTab, setMatchTab] = useState('upcoming');

  const teamName   = teamData?.name;
  const teamMatchesForSusp = teamData?.teamMatches ?? [];
  useEffect(() => {
    if (!teamName) return;
    getSuspensionMap(teamName, teamMatchesForSusp).then(setSuspMap);
  }, [teamName, teamMatchesForSusp]);

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

  const { team, name, standing, teamMatches, roster, bannedRoster, topScorers: _topScorers, meta } = teamData;
  const played   = teamMatches.filter(m => m.status === 'played' || m.status === 'forfait_a' || m.status === 'forfait_b');
  const upcoming = teamMatches.filter(m => m.status === 'upcoming');

  const rosterCols = buildRosterCols(suspMap, styles);
  const bannedCols  = buildBannedCols(styles);

  // Joueurs suspendus (carton rouge, remaining > 0)
  const suspendedRoster = Object.entries(suspMap)
    .filter(([, info]) => info.suspended && info.remaining > 0)
    .map(([num, info]) => ({
      id:            `susp-${num}`,
      number:        info.playerNum ?? parseInt(num),
      name:          info.playerName ?? `Joueur #${num}`,
      remaining:     info.remaining,
      returnJournee: info.returnJournee ?? null,
      returnDate:    info.returnDate    ?? null,
    }))
    .sort((a, b) => b.remaining - a.remaining);

  const fmtDate = (d) => {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  };

  return (
    <div className={styles.page}>
      <div className="container">

        {/* Header */}
        <div className={styles.header}>
          <FlagBadge team={name} size="xl" />
          <div className={styles.headerMeta}>
            <span className={styles.groupBadge}>Groupe {team.group}</span>
            {meta?.captain && <span className={styles.metaItem}><span className={styles.captainBadge}>C</span> {meta.captain}</span>}
            {meta?.coach   && <span className={styles.metaItem}><FontAwesomeIcon icon={faUserTie} /> Coach: {meta.coach}</span>}
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

        {/* Maillots */}
        {getJerseys(name) && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Maillots</h2>
            <JerseyPanel jerseys={getJerseys(name)} />
          </section>
        )}

        <div className={styles.cols}>
          {/* Roster */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Effectif ({roster.length} joueurs)</h2>
            {roster.length > 0 ? (
              <div className={styles.rosterWrap}>
              <SortableTable
                columns={rosterCols}
                data={roster.map(p => ({ ...p, id: `${p.number}-${p.team}` }))}
                defaultSort="number"
                defaultDir="asc"
                rowKey="id"
                emptyMessage="Aucun joueur enregistré."
              />
              </div>
            ) : (
              <p className={styles.empty}>Effectif non disponible.</p>
            )}
          </section>

          {/* Joueurs bannis */}
          {bannedRoster?.length > 0 && (
            <section className={styles.section}>
              <h2 className={`${styles.sectionTitle} ${styles.bannedTitle}`}>
                Joueurs bannis ({bannedRoster.length})
              </h2>
              <div className={styles.rosterWrap}>
                <SortableTable
                  columns={bannedCols}
                  data={bannedRoster.map(p => ({ ...p, id: `banned-${p.name}-${p.team}` }))}
                  defaultSort="number"
                  defaultDir="asc"
                  rowKey="id"
                  emptyMessage=""
                  getRowClass={() => styles.bannedRow}
                />
              </div>
            </section>
          )}

          {/* Joueurs suspendus */}
          {suspendedRoster.length > 0 && (
            <section className={styles.section}>
              <h2 className={`${styles.sectionTitle} ${styles.suspTitle}`}>
                Joueurs suspendus ({suspendedRoster.length})
              </h2>
              <div className={styles.rosterWrap}>
                <SortableTable
                  columns={[
                    { key: 'number', label: '#', sortable: true, align: 'right' },
                    { key: 'name', label: 'Joueur', sortable: true,
                      render: (v) => (
                        <span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                          <span>🟥</span>
                          <strong>{v}</strong>
                        </span>
                      )
                    },
                    { key: 'remaining', label: 'Matchs manqués', sortable: true,
                      render: (v) => (
                        <span className={styles.suspCountBadge}>
                          🚫 {v} match{v > 1 ? 's' : ''}
                        </span>
                      )
                    },
                    { key: 'returnJournee', label: 'Retour', sortable: false,
                      render: (v, row) => {
                        const j = v != null ? `J${v}` : null;
                        const d = fmtDate(row.returnDate);
                        if (!j && !d) return <em style={{ color:'var(--color-text-muted)', fontSize:'0.8rem' }}>Fin de tournoi</em>;
                        return (
                          <span style={{ display:'flex', flexDirection:'column', gap:'0.1rem', lineHeight:1.3 }}>
                            {j && <strong style={{ color:'var(--color-accent)' }}>{j}</strong>}
                            {d && <span style={{ fontSize:'0.75rem', color:'var(--color-text-muted)' }}>{d}</span>}
                          </span>
                        );
                      }
                    },
                  ]}
                  data={suspendedRoster}
                  defaultSort="remaining"
                  defaultDir="desc"
                  rowKey="id"
                  emptyMessage=""
                  getRowClass={() => styles.suspRow}
                />
              </div>
            </section>
          )}

          <div className={styles.rightCol}>
            {/* Matchs — onglets */}
            {teamMatches.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Matchs</h2>
                <div className={styles.matchTabs}>
                  {[['all','Tous'], ['upcoming','À venir'], ['played','Joués']].map(([key, label]) => (
                    <button
                      key={key}
                      className={`${styles.matchTab} ${matchTab === key ? styles.matchTabActive : ''}`}
                      onClick={() => setMatchTab(key)}
                    >
                      {label}
                      <span className={styles.matchTabCount}>
                        {key === 'all' ? teamMatches.length : key === 'upcoming' ? upcoming.length : played.length}
                      </span>
                    </button>
                  ))}
                </div>
                <div className={styles.matchList}>
                  {(matchTab === 'all' ? [...teamMatches].sort((a,b) => {
                      const da = a.date ? String(a.date).split('T')[0] : '';
                      const db = b.date ? String(b.date).split('T')[0] : '';
                      return da.localeCompare(db);
                    })
                    : matchTab === 'upcoming' ? upcoming
                    : [...played].reverse()
                  ).map((m, i) => (
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
