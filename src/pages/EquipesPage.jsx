import { useLeagueData } from '../services/dataStore';
import { Link } from 'react-router-dom';
import FlagBadge from '../components/shared/FlagBadge';
import { generateSlug } from '../config/teams';
import styles from './EquipesPage.module.css';

export default function EquipesPage() {
  const { teams, standings } = useLeagueData();

  const standingMap = Object.fromEntries(standings.map(s => [s.team, s]));

  const groupA = teams.filter(t => t.group === 'A');
  const groupB = teams.filter(t => t.group === 'B');

  const renderGroup = (groupTeams, label) => (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>Groupe {label}</h2>
      <div className={styles.grid}>
        {groupTeams.map(t => {
          const s = standingMap[t.name];
          const slug = generateSlug(t.name);
          return (
            <Link key={t.name} to={`/equipe/${slug}`} className={styles.card}>
              <FlagBadge team={t.name} size="lg" />
              <div className={styles.cardStats}>
                <span className={styles.pts}>{s?.points ?? 0} pts</span>
                <span className={styles.pj}>{s?.played ?? 0} matchs</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.title}>Équipes</h1>
        <p className={styles.sub}>{teams.length} équipes — Saison 2026</p>
        {renderGroup(groupA, 'A')}
        {renderGroup(groupB, 'B')}
      </div>
    </div>
  );
}
