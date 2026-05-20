import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTeam } from '../hooks/useTeam';
import { useLeagueData } from '../services/dataStore';
import { supabase } from '../services/supabaseClient';
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
            {info?.hasRed && (
              <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem' }}>
                <span style={{ fontSize:'0.85rem', lineHeight:1 }}>🟥</span>
                {info.suspended && info.remaining > 0 && (
                  <em className={stylesObj.suspText}>suspendu ({info.remaining} match{info.remaining > 1 ? 's' : ''})</em>
                )}
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
  const [matchTab, setMatchTab] = useState('all');

  const teamName  = teamData?.name;
  const teamMatches = teamData?.teamMatches ?? [];
  useEffect(() => {
    if (!teamName) return;

    // Source de vérité unique : match_events type=red + override manuel suspensions
    Promise.all([
      // Tous les rouges de cette équipe avec la journée du match
      supabase
        .from('match_events')
        .select('player_num, player_name, match_id, matches(journee, team_a, team_b, status)')
        .eq('type', 'red')
        .eq('team', teamName),
      // Overrides manuels de l'admin (durée différente de 1, levée anticipée, etc.)
      supabase
        .from('suspensions')
        .select('player_num, matches_remaining, match_id')
        .eq('team', teamName),
    ]).then(([redRes, suspRes]) => {
      const reds    = redRes.data  ?? [];
      const overrides = suspRes.data ?? [];

      // Journées jouées par cette équipe (played/forfait) dans l'ordre
      const playedJournees = [...teamMatches]
        .filter(m => ['played','forfait_a','forfait_b'].includes(m.status))
        .map(m => m.journee)
        .sort((a, b) => a - b);

      // Map matchId → override admin si existant
      const overrideByMatch = {};
      for (const o of overrides) {
        if (o.match_id) overrideByMatch[o.match_id] = o.matches_remaining;
      }

      const map = {};
      for (const ev of reds) {
        const key       = String(ev.player_num);
        const redJournee = ev.matches?.journee ?? 0;

        // Nombre de matchs de SUSPENSION pour ce rouge (1 par défaut, ou override admin)
        const matchId       = ev.match_id;
        const suspDuration  = overrideByMatch[matchId] !== undefined
          ? overrideByMatch[matchId]  // admin a modifié (0 = levée)
          : 1;                        // règlement art.8.2 : 1 match minimum

        // Matchs joués par l'équipe APRÈS la journée du rouge
        const playedSince = playedJournees.filter(j => j > redJournee).length;
        const remaining   = Math.max(0, suspDuration - playedSince);

        if (!map[key] || remaining > (map[key].remaining ?? 0)) {
          map[key] = {
            hasRed:    true,
            suspended: remaining > 0,
            remaining,
          };
        }
      }
      setSuspMap(map);
    });
  }, [teamName, teamMatches]);

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

  const { team, name, standing, teamMatches, roster, topScorers: _topScorers, meta } = teamData;
  const played   = teamMatches.filter(m => m.status === 'played' || m.status === 'forfait_a' || m.status === 'forfait_b');
  const upcoming = teamMatches.filter(m => m.status === 'upcoming');

  const rosterCols = buildRosterCols(suspMap, styles);

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
