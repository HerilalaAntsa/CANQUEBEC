import styles from './MatchCard.module.css';
import FlagBadge from '../shared/FlagBadge';
import ScoreBadge from '../shared/ScoreBadge';
import StatusPill from '../shared/StatusPill';

const VENUE_LABELS = {
  'VANIER':     '📍 Vanier',
  'NEUFCHATEL': '📍 Neufchâtel',
  'CHAUVEAU':   '📍 Chauveau',
};

function formatDate(date, dateRaw) {
  if (!date) return dateRaw ?? '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return dateRaw ?? '';
  return d.toLocaleDateString('fr-CA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export default function MatchCard({ match }) {
  if (!match) return null;

  const venue = VENUE_LABELS[match.venue?.trim()] ?? match.venue;
  const isTBD = match.phase != null;  // match de phase finale avec équipes inconnues

  return (
    <article className={`${styles.card} ${isTBD ? styles.cardTBD : ''}`}>
      <div className={styles.meta}>
        <span className={styles.date}>{formatDate(match.date, match.dateRaw)}</span>
        {match.time && <><span className={styles.dot}>·</span><span className={styles.time}>{match.time}</span></>}
        {venue && <><span className={styles.dot}>·</span><span className={styles.venue}>{venue}</span></>}
        {match.group && !isTBD && (
          <><span className={styles.dot}>·</span><span className={styles.group}>Groupe {match.group}</span></>
        )}
      </div>

      <div className={styles.matchup}>
        <div className={styles.teamWrap}>
          <FlagBadge team={match.teamA} link={!isTBD} size="md" />
        </div>

        <ScoreBadge scoreA={match.scoreA} scoreB={match.scoreB} size="md" />

        <div className={`${styles.teamWrap} ${styles.right}`}>
          <FlagBadge team={match.teamB} link={!isTBD} size="md" />
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
