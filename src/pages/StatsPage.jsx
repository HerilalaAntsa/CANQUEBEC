import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeagueData } from '../services/dataStore';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';
import FlagBadge from '../components/shared/FlagBadge';
import { generateSlug } from '../config/teams';
import styles from './StatsPage.module.css';

/** Agrège les buts depuis supabaseScores (déjà dans le store) */
function buildScorerList(supabaseScores) {
  const map = {};
  for (const match of Object.values(supabaseScores)) {
    for (const g of match.goals ?? []) {
      if (!g.player_name && !g.player_num) continue;
      const key = `${g.team}__${g.player_num ?? ''}__${g.player_name ?? ''}`;
      if (!map[key]) {
        map[key] = {
          key,
          team:       g.team,
          playerNum:  g.player_num ?? null,
          playerName: g.player_name || (g.player_num ? `#${g.player_num}` : '—'),
          goals: 0,
        };
      }
      map[key].goals++;
    }
  }
  return Object.values(map).sort((a, b) => b.goals - a.goals);
}

/** Construit le classement passeurs depuis les events Supabase */
function buildAssistList(assistEvents) {
  const map = {};
  for (const ev of assistEvents) {
    if (!ev.player_name && !ev.player_num) continue;
    const key = `${ev.team}__${ev.player_num ?? ''}__${ev.player_name ?? ''}`;
    if (!map[key]) {
      map[key] = {
        key,
        team:       ev.team,
        playerNum:  ev.player_num ?? null,
        playerName: ev.player_name || (ev.player_num ? `#${ev.player_num}` : '—'),
        assists: 0,
      };
    }
    map[key].assists++;
  }
  return Object.values(map).sort((a, b) => b.assists - a.assists);
}

export default function StatsPage() {
  const { supabaseScores, loadSupabaseScores } = useLeagueData();
  const navigate = useNavigate();

  const [tab, setTab] = useState('goals');
  const [assistEvents, setAssistEvents] = useState([]);
  const [assistLoading, setAssistLoading] = useState(false);

  // Rafraîchir les scores toutes les 30s
  useEffect(() => {
    const id = setInterval(() => loadSupabaseScores(), 30_000);
    return () => clearInterval(id);
  }, [loadSupabaseScores]);

  // Charger les passes décisives depuis Supabase
  useEffect(() => {
    if (!isSupabaseEnabled) return;
    setAssistLoading(true);
    supabase
      .from('match_events')
      .select('team, player_name, player_num, minute')
      .eq('type', 'assist')
      .then(({ data, error }) => {
        if (!error) setAssistEvents(data ?? []);
      })
      .finally(() => setAssistLoading(false));
  }, []);

  const scorers = useMemo(() => buildScorerList(supabaseScores), [supabaseScores]);
  const assisters = useMemo(() => buildAssistList(assistEvents), [assistEvents]);

  const hasScorers  = scorers.length > 0;
  const hasAssisters = assisters.length > 0;
  const noData = !isSupabaseEnabled || (!hasScorers && !hasAssisters);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.pageHeader}>
          <div className={styles.badge}>Saison 2026</div>
          <h1 className={styles.title}>Statistiques</h1>
          <p className={styles.sub}>Buteurs & Passeurs — mis à jour en temps réel</p>
        </div>

        {/* Onglets */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'goals' ? styles.tabActive : ''}`}
            onClick={() => setTab('goals')}
          >
            ⚽ Buteurs
            {hasScorers && <span className={styles.tabCount}>{scorers.length}</span>}
          </button>
          <button
            className={`${styles.tab} ${tab === 'assists' ? styles.tabActive : ''}`}
            onClick={() => setTab('assists')}
          >
            🎯 Passeurs
            {hasAssisters && <span className={styles.tabCount}>{assisters.length}</span>}
          </button>
        </div>

        {noData ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>⚽</span>
            <p className={styles.emptyTitle}>Statistiques à venir</p>
            <p className={styles.emptyText}>
              Les statistiques seront affichées ici dès que des matchs auront été joués.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            {tab === 'goals' && (
              hasScorers ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thRank}>#</th>
                      <th>Joueur</th>
                      <th>Équipe</th>
                      <th className={styles.thStat}>⚽</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorers.map((s, i) => (
                      <tr key={s.key} className={styles.row} onClick={() => navigate(`/equipe/${generateSlug(s.team)}`)}>
                        <td className={styles.tdRank}>
                          {i === 0 ? <span className={styles.medal}>🥇</span> :
                           i === 1 ? <span className={styles.medal}>🥈</span> :
                           i === 2 ? <span className={styles.medal}>🥉</span> :
                           <span className={styles.rankNum}>{i + 1}</span>}
                        </td>
                        <td className={styles.tdPlayer}>
                          {s.playerNum && <span className={styles.jersey}>#{s.playerNum}</span>}
                          <span className={styles.playerName}>{s.playerName}</span>
                        </td>
                        <td className={styles.tdTeam}>
                          <FlagBadge team={s.team} size="sm" />
                        </td>
                        <td className={styles.tdStat}>{s.goals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.noStat}>Aucun buteur enregistré pour l’instant.</div>
              )
            )}

            {tab === 'assists' && (
              assistLoading ? (
                <div className={styles.noStat}>Chargement…</div>
              ) : hasAssisters ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thRank}>#</th>
                      <th>Joueur</th>
                      <th>Équipe</th>
                      <th className={styles.thStat}>🎯</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assisters.map((a, i) => (
                      <tr key={a.key} className={styles.row} onClick={() => navigate(`/equipe/${generateSlug(a.team)}`)}>
                        <td className={styles.tdRank}>
                          {i === 0 ? <span className={styles.medal}>🥇</span> :
                           i === 1 ? <span className={styles.medal}>🥈</span> :
                           i === 2 ? <span className={styles.medal}>🥉</span> :
                           <span className={styles.rankNum}>{i + 1}</span>}
                        </td>
                        <td className={styles.tdPlayer}>
                          {a.playerNum && <span className={styles.jersey}>#{a.playerNum}</span>}
                          <span className={styles.playerName}>{a.playerName}</span>
                        </td>
                        <td className={styles.tdTeam}>
                          <FlagBadge team={a.team} size="sm" />
                        </td>
                        <td className={styles.tdStat}>{a.assists}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.noStat}>Aucun passeur enregistré pour l’instant.</div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
