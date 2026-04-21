import { useMemo } from 'react';
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
  const { standings, liveStandings, teams } = useLeagueData();
  const navigate = useNavigate();

  // Utiliser liveStandings (Supabase) si disponible, sinon fallback Excel
  const source = liveStandings?.length > 0 ? liveStandings : standings;
  const isLive = liveStandings?.length > 0;

  const tableData = useMemo(() => {
    return source
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
  }, [source, teams]);

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
