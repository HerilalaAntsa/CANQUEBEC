import { useMemo, useEffect, useState } from 'react';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';
import { useLeagueData } from '../services/dataStore';
import { useNavigate } from 'react-router-dom';
import SortableTable from '../components/shared/SortableTable';
import FlagBadge from '../components/shared/FlagBadge';
import { generateSlug } from '../config/teams';
import styles from './ClassementPage.module.css';

function buildPlayerStats(supabaseScores, cardEvents) {
  const map = {};
  const key = (team, num, name) => `${team}__${num ?? ''}__${name ?? ''}`;

  // Goals from supabaseScores.goals
  for (const match of Object.values(supabaseScores)) {
    for (const g of match.goals ?? []) {
      if (!g.player_name && !g.player_num) continue;
      const k = key(g.team, g.player_num, g.player_name);
      if (!map[k]) map[k] = { key: k, team: g.team, playerNum: g.player_num ?? null,
        playerName: g.player_name || (g.player_num ? `#${g.player_num}` : '—'),
        goals: 0, assists: 0, yellow: 0, red: 0 };
      map[k].goals++;
    }
  }

  // Assists/cards from match_events
  for (const ev of cardEvents) {
    if (!ev.player_name && !ev.player_num) continue;
    const k = key(ev.team, ev.player_num, ev.player_name);
    if (!map[k]) map[k] = { key: k, team: ev.team, playerNum: ev.player_num ?? null,
      playerName: ev.player_name || (ev.player_num ? `#${ev.player_num}` : '—'),
      goals: 0, assists: 0, yellow: 0, red: 0 };
    if (ev.type === 'assist') map[k].assists++;
    if (ev.type === 'yellow') map[k].yellow++;
    if (ev.type === 'red')    map[k].red++;
  }

  return Object.values(map).sort((a, b) => b.goals - a.goals || b.assists - a.assists);
}

const COLUMNS = [
  { key: 'pos',  label: '#',    sortable: false, align: 'center' },
  { key: 'team', label: 'Équipe', sortable: true,
    render: (v) => <FlagBadge team={v} link size="sm" />
  },
  { key: 'points', label: 'Pts', sortable: true, align: 'right',
    render: (v) => <strong>{v}</strong>
  },
  { key: 'played',       label: 'PJ',   sortable: true, align: 'right' },
  { key: 'won',          label: 'V',    sortable: true, align: 'right' },
  { key: 'drawn',        label: 'N',    sortable: true, align: 'right' },
  { key: 'lost',         label: 'D',    sortable: true, align: 'right' },
  { key: 'goalsFor',     label: 'B+',   sortable: true, align: 'right' },
  { key: 'goalsAgainst', label: 'B-',   sortable: true, align: 'right' },
  { key: 'goalDiff',     label: 'Diff', sortable: true, align: 'right',
    render: (v) => {
      const n = Number(v);
      if (n > 0) return <span style={{ color: 'var(--color-success)' }}>+{n}</span>;
      if (n < 0) return <span style={{ color: 'var(--color-danger)' }}>{n}</span>;
      return <span>0</span>;
    }
  },
  { key: 'last5', label: 'Forme', sortable: false, align: 'center',
    render: (_, row) => (
      <span style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
        {(row.last5 ?? []).length === 0
          ? <span style={{ color: '#444', fontSize: '0.7em' }}>—</span>
          : (row.last5 ?? []).map((r, i) => (
            <span key={i} title={r === 'W' ? 'Victoire' : r === 'L' ? 'Défaite' : 'Nul'} style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px', height: '18px',
              borderRadius: '50%',
              fontSize: '0.65rem',
              fontWeight: 900,
              background: r === 'W' ? '#16a34a' : r === 'L' ? '#dc2626' : '#9ca3af',
              color: '#fff',
              boxShadow: i === 0 ? `0 0 0 2px #fff, 0 0 0 3.5px ${r === 'W' ? '#16a34a' : r === 'L' ? '#dc2626' : '#9ca3af'}` : 'none',
              flexShrink: 0,
            }}>
              {r === 'W' ? '✓' : r === 'L' ? '✕' : '—'}
            </span>
          ))
        }
      </span>
    )
  },
];

export default function ClassementPage() {
  const { standings, liveStandings, teams, loadSupabaseScores, supabaseScores, matches } = useLeagueData();
  const navigate = useNavigate();
  const [tab, setTab] = useState('classement');
  const [cardEvents, setCardEvents] = useState([]);
  const [statsSort, setStatsSort] = useState('goals');

  // Rafraîchir les scores toutes les 30s
  useEffect(() => {
    const id = setInterval(() => loadSupabaseScores(), 30_000);
    return () => clearInterval(id);
  }, [loadSupabaseScores]);

  // Charger assists + cartons
  useEffect(() => {
    if (!isSupabaseEnabled) return;
    supabase
      .from('match_events')
      .select('type, team, player_name, player_num')
      .in('type', ['assist', 'yellow', 'red'])
      .then(({ data }) => setCardEvents(data ?? []));
  }, []);

  const isLive = liveStandings?.length > 0;
  const playerStats = useMemo(() => buildPlayerStats(supabaseScores, cardEvents), [supabaseScores, cardEvents]);
  const sortedStats = useMemo(() => {
    return [...playerStats].sort((a, b) => b[statsSort] - a[statsSort] || b.goals - a.goals);
  }, [playerStats, statsSort]);

  const last5Map = useMemo(() => {
    const map = {};
    const played = (matches ?? []).filter(m =>
      m.status === 'played' || m.status === 'forfait_a' || m.status === 'forfait_b'
    );
    for (const m of played) {
      const { teamA, teamB, scoreA, scoreB, journee, status } = m;
      if (!teamA || !teamB) continue;
      // Pour les forfaits, résultat direct sans scores
      let rA, rB;
      if (status === 'forfait_a')      { rA = 'L'; rB = 'W'; }
      else if (status === 'forfait_b') { rA = 'W'; rB = 'L'; }
      else if (scoreA === null || scoreB === null) continue;
      else {
        rA = scoreA > scoreB ? 'W' : scoreA < scoreB ? 'L' : 'D';
        rB = scoreB > scoreA ? 'W' : scoreB < scoreA ? 'L' : 'D';
      }
      if (!map[teamA]) map[teamA] = [];
      map[teamA].push({ journee: journee ?? 0, result: rA });
      if (!map[teamB]) map[teamB] = [];
      map[teamB].push({ journee: journee ?? 0, result: rB });
    }
    const out = {};
    for (const [team, arr] of Object.entries(map)) {
      out[team] = arr.sort((a, b) => b.journee - a.journee).slice(0, 5).map(r => r.result);
    }
    return out;
  }, [matches]);

  const tableData = useMemo(() => {
    // Base : standings Excel (toutes les équipes avec stats initiales)
    const base = {};
    for (const s of standings) {
      base[s.team] = { ...s, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
    }

    // Override avec les données live Supabase pour les équipes qui ont joué
    for (const s of (liveStandings ?? [])) {
      if (base[s.team]) {
        base[s.team] = { ...base[s.team], ...s };
      } else {
        base[s.team] = s;
      }
    }

    return Object.values(base)
      .map(s => {
        const t = teams.find(x => x.name === s.team);
        return { ...s, group: t?.group ?? '', id: s.team };
      })
      .filter(s => s.group)
      .sort((a, b) =>
        b.points - a.points ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor
      )
      .map((s, i, arr) => {
        // Rang ex-aequo standard : 1,1,3 (pas 1,2,3)
        let pos;
        if (i === 0) {
          pos = 1;
        } else {
          const prev = arr[i - 1];
          const tied =
            s.points    === prev.points &&
            s.goalDiff  === prev.goalDiff &&
            s.goalsFor  === prev.goalsFor;
          pos = tied ? arr[i - 1]._pos : i + 1;
        }
        s._pos = pos;
        return { ...s, pos, last5: last5Map[s.team] ?? [] };
      });
  }, [standings, liveStandings, teams, last5Map]);

  const getRowClass = (row) => {
    if (row.pos <= 8)  return styles.zoneGreen;
    if (row.pos <= 14) return styles.zoneNeutral;
    return styles.zoneRed;
  };

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.pageHeader}>
          <div className={styles.badge}>Saison 2026</div>
          <h1 className={styles.title}>Classement Général</h1>
          <p className={styles.sub}>
            {tableData.length} équipes · Groupes A &amp; B combinés
            {isLive && <span className={styles.liveBadge}>🔴 En temps réel</span>}
            <button className={styles.refreshBtn} onClick={() => loadSupabaseScores()} title="Actualiser">↻</button>
          </p>
        </div>

        {/* Onglets */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'classement' ? styles.tabActive : ''}`}
            onClick={() => setTab('classement')}
          >
            🏆 Classement
          </button>
          <button
            className={`${styles.tab} ${tab === 'buteurs' ? styles.tabActive : ''}`}
            onClick={() => setTab('buteurs')}
          >
            📊 Stats joueurs
            {playerStats.length > 0 && <span className={styles.tabCount}>{playerStats.length}</span>}
          </button>
        </div>

        {tab === 'buteurs' ? (
          <div>
            {/* Trier par */}
            <div className={styles.statsSortBar}>
              <span className={styles.statsSortLabel}>Trier par :</span>
              {[{k:'goals',l:'⚽ Buts'},{k:'assists',l:'🎯 Passes D'},{k:'yellow',l:'🟨 Jaunes'},{k:'red',l:'🟥 Rouges'}].map(({k,l}) => (
                <button key={k}
                  className={`${styles.sortBtn} ${statsSort === k ? styles.sortBtnActive : ''}`}
                  onClick={() => setStatsSort(k)}>{l}</button>
              ))}
            </div>
            <div className={styles.tableWrap}>
              {sortedStats.length === 0 ? (
                <div className={styles.noStat}>Aucune statistique enregistrée pour l'instant.</div>
              ) : (
                <table className={styles.scorerTable}>
                  <thead>
                    <tr>
                      <th className={styles.thRank}>#</th>
                      <th>Joueur</th>
                      <th>Équipe</th>
                      <th className={styles.thStat} title="Buts">⚽</th>
                      <th className={styles.thStat} title="Passes décisives">🎯</th>
                      <th className={styles.thStat} title="Cartons jaunes">🟨</th>
                      <th className={styles.thStat} title="Cartons rouges">🟥</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStats.map((s, i) => (
                      <tr key={s.key} className={styles.scorerRow} onClick={() => navigate(`/equipe/${generateSlug(s.team)}`)}>
                        <td className={styles.tdRank}>
                          {i === 0 ? <span>🥇</span> : i === 1 ? <span>🥈</span> : i === 2 ? <span>🥉</span> :
                            <span className={styles.rankNum}>{i + 1}</span>}
                        </td>
                        <td className={styles.tdPlayer}>
                          {s.playerNum && <span className={styles.jersey}>#{s.playerNum}</span>}
                          <span className={styles.playerName}>{s.playerName}</span>
                        </td>
                        <td><FlagBadge team={s.team} size="sm" /></td>
                        <td className={`${styles.tdStat} ${statsSort==='goals' ? styles.tdStatActive:''}`}>{s.goals || '—'}</td>
                        <td className={`${styles.tdStat} ${statsSort==='assists' ? styles.tdStatActive:''}`}>{s.assists || '—'}</td>
                        <td className={`${styles.tdStat} ${statsSort==='yellow' ? styles.tdStatActive:''}`}>
                          {s.yellow ? <span className={styles.cardY}>{s.yellow}</span> : '—'}
                        </td>
                        <td className={`${styles.tdStat} ${statsSort==='red' ? styles.tdStatActive:''}`}>
                          {s.red ? <span className={styles.cardR}>{s.red}</span> : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: 'var(--color-zone-green)' }} />
            Top 8 — Qualifiés phase finale (direct)
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: 'rgba(180,180,180,0.3)' }} />
            9e–14e — Qualifiés
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: 'var(--color-zone-red)' }} />
            4 derniers — Barragistes
          </span>
        </div>

        <div className={styles.tableWrap}>
          <SortableTable
            columns={COLUMNS}
            data={tableData}
            defaultSort="points"
            defaultDir="desc"
            rowKey="team"
            onRowClick={(row) => navigate(`/equipe/${generateSlug(row.team)}`)}
            getRowClass={getRowClass}
            emptyMessage="Classement disponible dès le début de la saison."
          />
        </div>
          </>
        )}
      </div>
    </div>
  );
}
