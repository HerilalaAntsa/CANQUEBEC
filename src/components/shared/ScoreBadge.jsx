import styles from './ScoreBadge.module.css';

/**
 * Affiche "2 - 1" si le match est joué, ou "vs" sinon
 */
export default function ScoreBadge({ scoreA, scoreB, size = 'md' }) {
  const played = scoreA !== null && scoreB !== null;

  return (
    <span className={`${styles.badge} ${styles[size]} ${played ? styles.played : styles.upcoming}`}>
      {played ? (
        <>
          <span className={styles.score}>{scoreA}</span>
          <span className={styles.sep}>-</span>
          <span className={styles.score}>{scoreB}</span>
        </>
      ) : (
        <span className={styles.vs}>VS</span>
      )}
    </span>
  );
}
