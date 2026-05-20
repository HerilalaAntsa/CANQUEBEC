import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLeagueData } from '../services/dataStore';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';
import { getAllRedCards, getAllActiveSuspensions } from '../services/disciplineService';
import FlagBadge from '../components/shared/FlagBadge';
import { generateSlug } from '../config/teams';
import styles from './StatsPage.module.css';

const REASON_LABELS = {
  red_card:  '🟥 Carton rouge',
  behavior:  '⚠️ Comportement',
  manual:    '✏️ Manuelle',
};

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
  const { supabaseScores, loadSupabaseScores, matches } = useLeagueData();
  const navigate = useNavigate();

  const [tab, setTab] = useState('goals');
  const [assistEvents, setAssistEvents] = useState([]);
  const [assistLoading, setAssistLoading] = useState(false);
  const [redEvents, setRedEvents] = useState([]);
  const [suspensions, setSuspensions] = useState([]);
  const [disciplineLoading, setDisciplineLoading] = useState(false);
  const [journeeFilter, setJourneeFilter] = useState('');

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

  // Charger cartons rouges + suspensions actives via disciplineService
  useEffect(() => {
    if (!isSupabaseEnabled || tab !== 'discipline') return;
    setDisciplineLoading(true);
    Promise.all([
      getAllRedCards(),
      getAllActiveSuspensions(matches),
    ]).then(([reds, actives]) => {
      setRedEvents(reds);
      setSuspensions(actives);
    }).finally(() => setDisciplineLoading(false));
  }, [tab, matches]);

  const scorers = useMemo(() => buildScorerList(supabaseScores), [supabaseScores]);
  const assisters = useMemo(() => buildAssistList(assistEvents), [assistEvents]);

  // Journées disponibles dans les rouges
  const journees = useMemo(() => {
    const set = new Set(redEvents.map(ev => ev.matches?.journee).filter(Boolean));
    return [...set].sort((a, b) => a - b);
  }, [redEvents]);
  const filteredReds = useMemo(() => {
    if (!journeeFilter) return redEvents;
    return redEvents.filter(ev => String(ev.matches?.journee) === String(journeeFilter));
  }, [redEvents, journeeFilter]);
  const activeSuspensions = suspensions; // getAllActiveSuspensions retourne déjà remaining > 0

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
          <button
            className={`${styles.tab} ${tab === 'discipline' ? styles.tabActive : ''}`}
            onClick={() => setTab('discipline')}
          >
            🟥 Discipline
            {activeSuspensions.length > 0 && <span className={`${styles.tabCount} ${styles.tabCountRed}`}>{activeSuspensions.length}</span>}
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
            {tab === 'discipline' && (
              disciplineLoading ? (
                <div className={styles.noStat}>Chargement…</div>
              ) : (
                <div className={styles.disciplineWrap}>
                  {/* Suspensions actives */}
                  {activeSuspensions.length > 0 && (
                    <div className={styles.suspSection}>
                      <h3 className={styles.suspTitle}>🚨 Joueurs suspendus actuellement</h3>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Joueur</th>
                            <th>Équipe</th>
                            <th className={styles.thStat}>Matchs restants</th>
                            <th>Raison</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeSuspensions.map(s => (
                            <tr key={`${s.team}-${s.playerNum}`} className={styles.row} onClick={() => navigate(`/equipe/${generateSlug(s.team)}`)}>
                              <td className={styles.tdPlayer}>
                                {s.playerNum && <span className={styles.jersey}>#{s.playerNum}</span>}
                                <span className={styles.playerName}>{s.playerName || '—'}</span>
                              </td>
                              <td className={styles.tdTeam}><FlagBadge team={s.team} size="sm" /></td>
                              <td className={styles.tdStat} style={{ color: 'var(--color-accent)' }}>{s.remaining}</td>
                              <td className={styles.tdReason}>🟥 Carton rouge</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Cartons rouges par journée */}
                  <div className={styles.suspSection}>
                    <div className={styles.disciplineHeader}>
                      <h3 className={styles.suspTitle}>🟥 Cartons rouges</h3>
                      {journees.length > 1 && (
                        <div className={styles.journeeFilter}>
                          <button
                            className={`${styles.jBtn} ${journeeFilter === '' ? styles.jBtnActive : ''}`}
                            onClick={() => setJourneeFilter('')}
                          >Toutes</button>
                          {journees.map(j => (
                            <button
                              key={j}
                              className={`${styles.jBtn} ${String(journeeFilter) === String(j) ? styles.jBtnActive : ''}`}
                              onClick={() => setJourneeFilter(String(j))}
                            >J{j}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    {filteredReds.length === 0 ? (
                      <div className={styles.noStat}>Aucun carton rouge enregistré.</div>
                    ) : (
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Joueur</th>
                            <th>Équipe</th>
                            <th>Match</th>
                            <th className={styles.thStat}>Min.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredReds.map(ev => (
                            <tr key={ev.id} className={styles.row} onClick={() => navigate(`/equipe/${generateSlug(ev.team)}`)}>
                              <td className={styles.tdPlayer}>
                                {ev.player_num && <span className={styles.jersey}>#{ev.player_num}</span>}
                                <span className={styles.playerName}>{ev.player_name || '—'}</span>
                              </td>
                              <td className={styles.tdTeam}><FlagBadge team={ev.team} size="sm" /></td>
                              <td className={styles.tdMatch}>
                                {ev.matches ? `J${ev.matches.journee} — ${ev.matches.team_a} vs ${ev.matches.team_b}` : '—'}
                              </td>
                              <td className={styles.tdStat}>{ev.minute ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )
            )}          </div>
        )}
      </div>
    </div>
  );
}
