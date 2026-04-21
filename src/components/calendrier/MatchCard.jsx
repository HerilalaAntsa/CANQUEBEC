import { Link } from 'react-router-dom';
import styles from './MatchCard.module.css';
import FlagBadge from '../shared/FlagBadge';
import ScoreBadge from '../shared/ScoreBadge';
import StatusPill from '../shared/StatusPill';

const VENUE_LABELS = {
  'VANIER':     '📍 Vanier',
  'NEUFCHATEL': '📍 Neufchâtel',
  'CHAUVEAU':   '📍 Chauveau',
};

const ARB_ROLES = [
  { key: 'referee',     label: 'C'  },
  { key: 'ref1',        label: 'T1' },
  { key: 'ref2',        label: 'T2' },
  { key: 'coordinator', label: 'Co' },
];

function ArbitresRow({ match }) {
  const list = ARB_ROLES.filter(r => match[r.key]);
  if (!list.length) return null;
  return (
    <div className={styles.arbitres}>
      🧑‍⚖️
      {list.map(r => (
        <span key={r.key} className={styles.arbChip}>
          <span className={styles.arbRole}>{r.label}</span>
          {match[r.key]}
        </span>
      ))}
    </div>
  );
}

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
  const isTBD = match.phase != null;

  const card = (
    <article className={`${styles.card} ${isTBD ? styles.cardTBD : ''} ${match.supabaseId ? styles.clickable : ''}`}>
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
        <ArbitresRow match={match} />
      </div>
    </article>
  );

  if (match.supabaseId) {
    return (
      <Link to={`/match/${match.supabaseId}`} className={styles.cardLink}>
        {card}
      </Link>
    );
  }
  return card;
}
