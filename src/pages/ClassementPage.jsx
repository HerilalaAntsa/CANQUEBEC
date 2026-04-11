import { useState } from 'react';
import { useLeagueData } from '../services/dataStore';
import { useNavigate } from 'react-router-dom';
import SortableTable from '../components/shared/SortableTable';
import FlagBadge from '../components/shared/FlagBadge';
import { generateSlug } from '../config/teams';
import styles from './ClassementPage.module.css';

const COLUMNS = [
  { key: 'pos',          label: 'Pos',   sortable: false, align: 'right' },
  { key: 'team',         label: 'Équipe', sortable: true,
    render: (v) => <FlagBadge team={v} link size="sm" />
  },
  { key: 'played',       label: 'PJ',  sortable: true, align: 'right' },
  { key: 'won',          label: 'V',   sortable: true, align: 'right' },
  { key: 'drawn',        label: 'N',   sortable: true, align: 'right' },
  { key: 'lost',         label: 'D',   sortable: true, align: 'right' },
  { key: 'goalsFor',     label: 'BP',  sortable: true, align: 'right' },
  { key: 'goalsAgainst', label: 'BC',  sortable: true, align: 'right' },
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

function buildTableData(standings, group) {
  return standings
    .filter(s => s.group === group)
    .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
    .map((s, i) => ({ ...s, pos: i + 1, id: s.team }));
}

export default function ClassementPage() {
  const { standings, teams } = useLeagueData();
  const navigate = useNavigate();
  const [activeGroup, setActiveGroup] = useState('A');

  // Enrichir standings avec le groupe depuis teams
  const enriched = standings.map(s => {
    const team = teams.find(t => t.name === s.team);
    return { ...s, group: team?.group ?? '' };
  });

  const tableData = buildTableData(enriched, activeGroup);

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.title}>Classement</h1>

        <div className={styles.tabs}>
          {['A', 'B'].map(g => (
            <button
              key={g}
              className={`${styles.tab} ${activeGroup === g ? styles.active : ''}`}
              onClick={() => setActiveGroup(g)}
            >
              Groupe {g}
            </button>
          ))}
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: 'var(--color-success)' }} />
            1er — Qualifié direct
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: 'var(--color-accent)' }} />
            2e–4e — Phase finale
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dot} style={{ background: 'var(--color-danger)' }} />
            2 derniers — Non qualifiés
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
            emptyMessage="Aucun classement disponible pour ce groupe."
          />
        </div>

        {/* Highlight top 4 via CSS custom */}
        <style>{`
          .standings-table tbody tr:nth-child(-n+4) td:first-child {
            border-left: 3px solid var(--color-accent);
          }
        `}</style>
      </div>
    </div>
  );
}
