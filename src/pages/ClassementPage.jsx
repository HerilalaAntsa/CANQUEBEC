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
];

export default function ClassementPage() {
  const { standings, liveStandings, teams, loadSupabaseScores } = useLeagueData();
  const navigate = useNavigate();

  // Rafraîchir les scores toutes les 30s
  useEffect(() => {
    const id = setInterval(() => loadSupabaseScores(), 30_000);
    return () => clearInterval(id);
  }, [loadSupabaseScores]);

  const isLive = liveStandings?.length > 0;

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
      .map((s, i) => ({ ...s, pos: i + 1 }));
  }, [standings, liveStandings, teams]);

  const getRowClass = (row) => {
    if (row.pos <= 8)  return styles.zoneGreen;
    if (row.pos <= 14) return styles.zoneOrange;
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
            Top 8 — Qualifiés phase finale
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: 'var(--color-zone-orange)' }} />
            9e–14e — Milieu de tableau
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
