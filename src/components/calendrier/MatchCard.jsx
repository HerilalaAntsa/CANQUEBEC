import styles from './MatchCard.module.css';
import FlagBadge from '../shared/FlagBadge';
import ScoreBadge from '../shared/ScoreBadge';
import StatusPill from '../shared/StatusPill';

const VENUE_LABELS = {
  'VANIER':     '📍 Vanier',
  'NEUFCHATEL': '📍 Neufchâtel',
};

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('fr-CA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export default function MatchCard({ match }) {
  if (!match) return null;

  const venue = VENUE_LABELS[match.venue?.trim()] ?? match.venue;

  return (
    <article className={styles.card}>
      <div className={styles.meta}>
        <span className={styles.date}>{formatDate(match.date)}</span>
        <span className={styles.dot}>·</span>
        <span className={styles.time}>{match.time}</span>
        <span className={styles.dot}>·</span>
        <span className={styles.venue}>{venue}</span>
        {match.group && (
          <>
            <span className={styles.dot}>·</span>
            <span className={styles.group}>Groupe {match.group}</span>
          </>
        )}
      </div>

      <div className={styles.matchup}>
        <div className={styles.teamWrap}>
          <FlagBadge team={match.teamA} link size="md" />
        </div>

        <ScoreBadge scoreA={match.scoreA} scoreB={match.scoreB} size="md" />

        <div className={`${styles.teamWrap} ${styles.right}`}>
          <FlagBadge team={match.teamB} link size="md" />
        </div>
      </div>

      <div className={styles.footer}>
        <StatusPill match={match} />
        {match.referee && (
          <span className={styles.referee}>🧑‍⚖️ {match.referee}</span>
        )}
      </div>
    </article>
  );
}
