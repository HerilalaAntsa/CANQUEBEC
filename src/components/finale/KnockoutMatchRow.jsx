/**
 * KnockoutMatchRow — ligne compacte style FIFA pour la phase finale
 *
 * Format : StatusPill | date heure | flagA nomA score—score nomB flagB | lieu
 *
 * Conception :
 *  - Lecture rapide sur une ligne
 *  - Gagnant en gras, perdant grisé
 *  - Supporte les TAB : "0 (4)"
 *  - Link vers la page match si supabaseId disponible
 */
import { Link } from 'react-router-dom';
import { getFlag, getShortName, normalizeTeamName } from '../../config/teams';
import StatusPill from '../shared/StatusPill';
import { getWinner, getLoser } from './BracketView';
import styles from './KnockoutMatchRow.module.css';

const VENUE_SHORT = {
  'VANIER':     'Vanier',
  'NEUFCHATEL': 'Neufchâtel',
  'CHAUVEAU':   'Chauveau',
  'PARC VICTORIA': 'Parc Victoria',
  'STADE CHAUVEAU': 'St. Chauveau',
  'ECOLE VANIER': 'École Vanier',
};

function shortVenue(v) {
  if (!v) return null;
  const up = v.toUpperCase().trim();
  for (const [k, label] of Object.entries(VENUE_SHORT)) {
    if (up.includes(k)) return label;
  }
  return v;
}

function formatDate(date) {
  if (!date) return null;
  const safe = String(date).slice(0, 10) + 'T00:00:00';
  const d = new Date(safe);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtScore(score, penalty) {
  if (score == null) return '—';
  if (penalty != null) return `${score} (${penalty})`;
  return String(score);
}

function TeamCell({ team, score, penalty, isWinner, isLoser, align }) {
  const name = team
    ? (getShortName(normalizeTeamName(team)) || team)
    : null;
  const f = team ? getFlag(normalizeTeamName(team)) : null;
  const isRight = align === 'right';

  return (
    <div className={[
      styles.teamCell,
      isWinner ? styles.win  : '',
      isLoser  ? styles.loss : '',
      !team    ? styles.tbd  : '',
      isRight  ? styles.teamRight : '',
    ].filter(Boolean).join(' ')}>

      {/* Côté droit : score | nom | flag */}
      {isRight && <span className={styles.score}>{fmtScore(score, penalty)}</span>}
      {isRight && <span className={styles.name}>{name ?? 'À déterm.'}</span>}

      {f?.startsWith('/') ? (
        <img src={f} alt={team} className={styles.flag} />
      ) : f && f !== '🏴' ? (
        <span className={styles.flagEmoji}>{f}</span>
      ) : (
        <span className={styles.flagTbd}>?</span>
      )}

      {/* Côté gauche : flag | nom | score */}
      {!isRight && <span className={styles.name}>{name ?? 'À déterm.'}</span>}
      {!isRight && <span className={styles.score}>{fmtScore(score, penalty)}</span>}
    </div>
  );
}

export default function KnockoutMatchRow({ match }) {
  if (!match) return null;

  const winner  = getWinner(match);
  const loser   = getLoser(match);
  const played  = match.status === 'played'
    || match.status === 'forfait_a'
    || match.status === 'forfait_b';
  const eqScore = played && match.scoreA === match.scoreB;

  const row = (
    <div className={[
      styles.row,
      played ? styles.rowPlayed : '',
      match.supabaseId ? styles.rowClickable : '',
    ].filter(Boolean).join(' ')}>

      {/* Statut */}
      <div className={styles.status}>
        <StatusPill match={match} />
      </div>

      {/* Date + heure */}
      <div className={styles.datetime}>
        <span className={styles.date}>{formatDate(match.date) ?? '—'}</span>
        {match.time && <span className={styles.time}>{match.time}</span>}
      </div>

      {/* Equipe A */}
      <TeamCell
        team={match.teamA}
        score={played ? match.scoreA : null}
        penalty={eqScore ? match.penaltyA : null}
        isWinner={winner === match.teamA}
        isLoser={loser === match.teamA}
        align="left"
      />

      {/* Séparateur */}
      <div className={styles.vs}>vs</div>

      {/* Equipe B */}
      <TeamCell
        team={match.teamB}
        score={played ? match.scoreB : null}
        penalty={eqScore ? match.penaltyB : null}
        isWinner={winner === match.teamB}
        isLoser={loser === match.teamB}
        align="right"
      />

      {/* Lieu */}
      <div className={styles.venue}>
        {shortVenue(match.venue) ?? ''}
      </div>
    </div>
  );

  if (match.supabaseId) {
    return (
      <Link to={`/match/${match.supabaseId}`} className={styles.link}>
        {row}
      </Link>
    );
  }
  return row;
}
