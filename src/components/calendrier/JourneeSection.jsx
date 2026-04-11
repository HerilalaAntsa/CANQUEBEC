import MatchCard from './MatchCard';
import styles from './JourneeSection.module.css';

function formatJourneeDate(matches) {
  if (!matches.length) return '';
  const dates = [...new Set(matches.map(m =>
    new Date(m.date).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })
  ))];
  return dates.join(' & ');
}

export default function JourneeSection({ journee, matches }) {
  if (!matches?.length) return null;

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Journée {String(journee).padStart(2, '0')}</h2>
        <span className={styles.dates}>{formatJourneeDate(matches)}</span>
      </div>
      <div className={styles.grid}>
        {matches.map((m, i) => (
          <MatchCard key={m.id ?? `j${journee}-${i}`} match={m} />
        ))}
      </div>
    </section>
  );
}
