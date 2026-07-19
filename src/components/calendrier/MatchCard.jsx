import { Link } from 'react-router-dom';
import styles from './MatchCard.module.css';
import FlagBadge from '../shared/FlagBadge';
import ScoreBadge from '../shared/ScoreBadge';
import StatusPill from '../shared/StatusPill';

const VENUE_LABELS = {
  'VANIER':     '📍 École Vanier',
  'NEUFCHATEL': '📍 École Neufchâtel',
  'CHAUVEAU':   '📍 Chauveau',
};

const ARB_ROLES = [
  { key: 'referee',     label: 'C'  },
  { key: 'ref1',        label: 'T1' },
  { key: 'ref2',        label: 'T2' },
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
  if (!date) return typeof dateRaw === 'string' ? dateRaw : '';
  // Normalise : accepte string ISO ou objet Date
  const d = date instanceof Date ? date : new Date(String(date).slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return typeof dateRaw === 'string' ? dateRaw : '';
  return d.toLocaleDateString('fr-CA', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export default function MatchCard({ match }) {
  if (!match) return null;

  const venue = VENUE_LABELS[match.venue?.trim()] ?? match.venue;
  const isTBD = match.phase != null;

  const isForfait = match.status === 'forfait_a' || match.status === 'forfait_b';
  const forfaitTeam = match.status === 'forfait_a' ? match.teamA : match.status === 'forfait_b' ? match.teamB : null;

  const normT = s => (s || '').trim().toUpperCase().replace(/\u2019/g, "'");
  const tA = normT(match.teamA);
  const tB = normT(match.teamB);

  const card = (
    <article className={`${styles.card} ${isTBD ? styles.cardTBD : ''} ${isForfait ? styles.cardForfait : ''} ${match.supabaseId ? styles.clickable : ''}`}>
      <div className={styles.statusBadge}><StatusPill match={match} /></div>
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
          {isForfait && forfaitTeam === match.teamA && <span className={styles.forfaitBadge}>FORFAIT</span>}
        </div>
        <ScoreBadge scoreA={match.scoreA} scoreB={match.scoreB} size="md" />
        <div className={`${styles.teamWrap} ${styles.right}`}>
          <FlagBadge team={match.teamB} link={!isTBD} size="md" />
          {isForfait && forfaitTeam === match.teamB && <span className={styles.forfaitBadge}>FORFAIT</span>}
        </div>
      </div>

      {match.scoreA != null && match.scoreA === match.scoreB &&
       (match.penaltyA != null || match.penaltyB != null) && (
        <div className={styles.penaltyRow}>
          🎯 Tirs au but {match.penaltyA ?? 0} – {match.penaltyB ?? 0}
        </div>
      )}

      {match.goals?.length > 0 && (
        <div className={styles.scorers}>
          <div className={styles.scorersCol}>
            {match.goals.filter(g => normT(g.team) === tA).map((g, i) => (
              <span key={i} className={styles.scorer}>
                ⚽ {g.player_name || (g.player_num ? `#${g.player_num}` : '?')}{g.minute ? <span className={styles.scorerMin}> {g.minute}'</span> : ''}
              </span>
            ))}
          </div>
          <div className={styles.scorersSep} />
          <div className={`${styles.scorersCol} ${styles.scorersRight}`}>
            {match.goals.filter(g => normT(g.team) === tB).map((g, i) => (
              <span key={i} className={styles.scorer}>
                ⚽ {g.player_name || (g.player_num ? `#${g.player_num}` : '?')}{g.minute ? <span className={styles.scorerMin}> {g.minute}'</span> : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {match.redCards?.length > 0 && (
        <div className={styles.reds}>
          <div className={styles.redsCol}>
            {match.redCards.filter(r => normT(r.team) === tA).map((r, i) => (
              <span key={i} className={styles.redItem}>
                🟥 {r.player_name || (r.player_num ? `#${r.player_num}` : '?')}
              </span>
            ))}
          </div>
          <div className={styles.redsSep} />
          <div className={`${styles.redsCol} ${styles.redsRight}`}>
            {match.redCards.filter(r => normT(r.team) === tB).map((r, i) => (
              <span key={i} className={styles.redItem}>
                🟥 {r.player_name || (r.player_num ? `#${r.player_num}` : '?')}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.footer}>
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
