import { useMemo, useEffect } from 'react';
import { useLeagueData } from '../services/dataStore';
import { useNavigate } from 'react-router-dom';
import SortableTable from '../components/shared/SortableTable';
import FlagBadge from '../components/shared/FlagBadge';
import { generateSlug } from '../config/teams';
import styles from './ClassementPage.module.css';

const COLUMNS = [
  { key: 'pos',  label: '#',    sortable: false, align: 'center' },
  { key: 'group', label: 'Gr',  sortable: false, align: 'center',
    render: (v) => <span className={styles.groupBadge}>{v}</span>
  },
  { key: 'team', label: 'Équipe', sortable: true,
    render: (v) => <FlagBadge team={v} link size="sm" />
  },
  { key: 'played',       label: 'PJ',   sortable: true, align: 'right' },
  { key: 'won',          label: 'V',    sortable: true, align: 'right' },
  { key: 'drawn',        label: 'N',    sortable: true, align: 'right' },
  { key: 'lost',         label: 'D',    sortable: true, align: 'right' },
  { key: 'goalsFor',     label: 'BP',   sortable: true, align: 'right' },
  { key: 'goalsAgainst', label: 'BC',   sortable: true, align: 'right' },
  { key: 'goalDiff',     label: 'Diff', sortable: true, align: 'right',
    render: (v) => {
      const n = Number(v);
      if (n > 0) return <span style={{ color: 'var(--color-success)' }}>+{n}</span>;
      if (n < 0) return <span style={{ color: 'var(--color-danger)' }}>{n}</span>;
      return <span>0</span>;
    }
  },
  { key: 'points', label: 'Pts', sortable: true, align: 'right', highlight: true },
  { key: 'last5', label: '5 derniers', sortable: false, align: 'center',
    render: (v) => (
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center', justifyContent: 'center' }}>
        {(v ?? []).map((r, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '18px', height: '18px', borderRadius: '50%',
            fontSize: '10px', fontWeight: '700',
            background: r === 'W' ? 'rgba(34,197,94,0.2)' : r === 'L' ? 'rgba(239,68,68,0.2)' : 'rgba(150,150,150,0.12)',
            color: r === 'W' ? '#22c55e' : r === 'L' ? '#ef4444' : '#9ca3af',
          }}>
            {r === 'W' ? '✓' : r === 'L' ? '✗' : '—'}
          </span>
        ))}
      </div>
    )
  },
];

export default function ClassementPage() {
  const { standings, liveStandings, teams, loadSupabaseScores, supabaseScores } = useLeagueData();
  const navigate = useNavigate();

  // Rafraîchir les scores toutes les 30s
  useEffect(() => {
    const id = setInterval(() => loadSupabaseScores(), 30_000);
    return () => clearInterval(id);
  }, [loadSupabaseScores]);

  const isLive = liveStandings?.length > 0;

  const last5Map = useMemo(() => {
    const map = {};
    for (const [key, m] of Object.entries(supabaseScores ?? {})) {
      if (m.status !== 'played') continue;
      const parts = key.split(':');
      const journee = parseInt(parts[0]) || 0;
      const { teamA, teamB, scoreA, scoreB } = m;
      const rA = scoreA > scoreB ? 'W' : scoreA < scoreB ? 'L' : 'D';
      const rB = scoreB > scoreA ? 'W' : scoreB < scoreA ? 'L' : 'D';
      if (!map[teamA]) map[teamA] = [];
      map[teamA].push({ journee, result: rA });
      if (!map[teamB]) map[teamB] = [];
      map[teamB].push({ journee, result: rB });
    }
    const out = {};
    for (const [team, arr] of Object.entries(map)) {
      out[team] = arr.sort((a, b) => b.journee - a.journee).slice(0, 5).map(r => r.result);
    }
    return out;
  }, [supabaseScores]);

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
      .map((s, i) => ({ ...s, pos: i + 1, last5: last5Map[s.team] ?? [] }));
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
      </div>
    </div>
  );
}
