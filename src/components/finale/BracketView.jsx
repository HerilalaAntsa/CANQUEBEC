/**
 * BracketView — arbre de tournoi à élimination directe
 *
 * Architecture SOLID :
 *  - Composant purement présentationnel, reçoit un tableau `matches` depuis le parent
 *  - Calcule les groupes par round (trié par date/heure)
 *  - Le winner est dérivé des scores → pas de state supplémentaire
 *  - Extensible : ajouter un round = ajouter une entrée dans ROUND_KEYS
 *
 * Connexions visuelles : CSS pair-groups (flex-1 par slot → auto-centrage)
 *   R16 : 4 matches → 2 paires → 2 QF
 *   QF  : 2 matches → 1 paire  → 1 SF
 *   SF  : 1 match              → Finale / 3e place
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getFlag, getShortName, normalizeTeamName, canonicalizeTeam } from '../../config/teams';
import styles from './BracketView.module.css';

const VENUE_LABELS = {
  'VANIER':     'Vanier',
  'NEUFCHATEL': 'Neufchâtel',
  'CHAUVEAU':   'Chauveau',
};

export const ROUND_KEYS = [
  '1/8e de finale',
  'Quarts de finale',
  'Demi-finales',
  'Finale',
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Gagnant (null si non joue). Supporte les tirs au but via penaltyA/penaltyB. */
export function getWinner(m) {
  if (!m) return null;
  if (m.status === 'forfait_a') return m.teamB;
  if (m.status === 'forfait_b') return m.teamA;
  if (m.status !== 'played') return null;
  const a = m.scoreA ?? -1;
  const b = m.scoreB ?? -2;
  if (a > b) return m.teamA;
  if (b > a) return m.teamB;
  const pA = m.penaltyA ?? -1;
  const pB = m.penaltyB ?? -2;
  if (pA > pB) return m.teamA;
  if (pB > pA) return m.teamB;
  return null;
}

/** Perdant (null si non joue) */
export function getLoser(m) {
  const w = getWinner(m);
  if (!w) return null;
  return w === m?.teamA ? m?.teamB : m?.teamA;
}

/** '2' ou '0 (4)' si tirs au but */
function fmtScore(score, penalty) {
  if (score == null) return null;
  if (penalty != null) return `${score} (${penalty})`;
  return String(score);
}

/**
 * Positions exactes du bracket 1/8e selon le tirage officiel.
 * Indices 0-3 = cote GAUCHE (top→bottom), 4-7 = cote DROIT (top→bottom).
 * La clé est insensible a l'ordre des equipes (A:B ou B:A).
 * Pour les rounds suivants (QF/SF), on utilisera bracket_position de Supabase
 * ou l'ordre de creation par defaut.
 */
const R16_POSITIONS = {
  // Gauche (0-3) ─────────────────────────────────────
  'SÉNÉGAL:HAÏTI':              0, 'HAÏTI:SÉNÉGAL':              0,
  'NATIONS-UNIES:MADAGASCAR':   1, 'MADAGASCAR:NATIONS-UNIES':   1,
  'CAMEROUN:MALI':              2, 'MALI:CAMEROUN':              2,
  "CÔTE D'IVOIRE:TANZANIE":     3, "TANZANIE:CÔTE D'IVOIRE":     3,
  // Droite (4-7) ─────────────────────────────────────
  'CENTRAFRIQUE:ALGÉRIE':       4, 'ALGÉRIE:CENTRAFRIQUE':       4,
  'GUINÉE:GABON':               5, 'GABON:GUINÉE':               5,
  'BURKINA FASO:TOGO':          6, 'TOGO:BURKINA FASO':          6,
  'GAMBIE:RD CONGO':            7, 'RD CONGO:GAMBIE':            7,
};

function pairKey(m) {
  // Canonicaliser : un 1/8 stock\u00e9 "SENEGAL" (sans accent) doit correspondre \u00e0 la
  // position "S\u00c9N\u00c9GAL" du tirage, sinon le bracket se d\u00e9cale et les appariements
  // de quarts sont faux.
  return `${canonicalizeTeam(m.teamA)}:${canonicalizeTeam(m.teamB)}`;
}

/**
 * Trie les R16 selon les positions officielles du tirage.
 * Les rounds suivants (QF/SF) sont tries par bracket_position Supabase ou
 * par date/heure par defaut.
 */
function sortR16ByBracket(arr) {
  return [...arr].sort((a, b) => {
    const pa = R16_POSITIONS[pairKey(a)] ?? 99;
    const pb = R16_POSITIONS[pairKey(b)] ?? 99;
    if (pa !== pb) return pa - pb;
    // Fallback : date/heure
    const ka = `${a.date ?? '9999'}${a.time ?? '99:99'}`;
    const kb = `${b.date ?? '9999'}${b.time ?? '99:99'}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

// ─── Avancement automatique (projection des gagnants) ────────────────────────

/** Positions R16 (0-7) alimentant chaque slot de quart (0-3). */
const QF_FEEDERS = [[0, 1], [2, 3], [4, 5], [6, 7]];
/** Slots de quart (0-3) alimentant chaque slot de demie (0-1). */
const SF_FEEDERS = [[0, 1], [2, 3]];

const teamPairKey = (a, b) =>
  [canonicalizeTeam(a), canonicalizeTeam(b)].sort().join('|');

/** Match provisoire = matchup projeté sans ligne Supabase (non cliquable, sans score). */
function provisional(phase, teamA, teamB) {
  return {
    phase,
    teamA: teamA ?? 'À déterminer',
    teamB: teamB ?? 'À déterminer',
    projected: true,
    status: 'upcoming',
    scoreA: null,
    scoreB: null,
  };
}

/**
 * Construit l'arbre complet en PROJETANT automatiquement les gagnants dans les
 * tours suivants. Les admins n'ont qu'à saisir les scores des matchs : le gagnant
 * monte tout seul.
 *  - Si un vrai match (saisi en admin) existe pour un matchup projeté, on l'utilise
 *    (scores, buteurs, clic). Sinon on affiche une carte provisoire avec les équipes.
 * Retourne { r16:[8], qf:[4], sf:[2], finale, third }.
 */
export function buildBracket(phaseMatches) {
  const byRound = groupByRound(phaseMatches ?? []);

  // Index des vrais matchs par (round → clé de paire d'équipes canonicalisée)
  const realByRound = {};
  for (const round of ROUND_KEYS) {
    realByRound[round] = new Map();
    for (const m of byRound[round] ?? []) {
      if (!m.teamA || !m.teamB) continue;
      if (m.teamA === 'À déterminer' || m.teamB === 'À déterminer') continue;
      realByRound[round].set(teamPairKey(m.teamA, m.teamB), m);
    }
  }
  const findReal = (round, a, b) =>
    (a && b) ? (realByRound[round]?.get(teamPairKey(a, b)) ?? null) : null;

  // R16 : positions fixes du tirage officiel
  const r16 = sortR16ByBracket(byRound['1/8e de finale'] ?? []);

  // Quarts : gagnant(feeder0) vs gagnant(feeder1)
  const qf = QF_FEEDERS.map(([f0, f1]) => {
    const a = getWinner(r16[f0]);
    const b = getWinner(r16[f1]);
    return findReal('Quarts de finale', a, b) ?? provisional('Quarts de finale', a, b);
  });

  // Demies : gagnant(qf0) vs gagnant(qf1), etc.
  const sf = SF_FEEDERS.map(([q0, q1]) => {
    const a = getWinner(qf[q0]);
    const b = getWinner(qf[q1]);
    return findReal('Demi-finales', a, b) ?? provisional('Demi-finales', a, b);
  });

  // Finale : gagnants des 2 demies ; 3e place : perdants des 2 demies
  const finA = getWinner(sf[0]); const finB = getWinner(sf[1]);
  const thdA = getLoser(sf[0]);  const thdB = getLoser(sf[1]);
  const finale = findReal('Finale', finA, finB) ?? provisional('Finale', finA, finB);
  const third  = findReal('Finale', thdA, thdB) ?? provisional('Finale', thdA, thdB);

  return { r16, qf, sf, finale, third };
}

/** Groupement des matches par round */
function groupByRound(matches) {
  const map = {};
  for (const r of ROUND_KEYS) map[r] = [];
  for (const m of (matches ?? [])) {
    if (m.phase && map[m.phase] !== undefined) map[m.phase].push(m);
  }
  return map;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TeamFlag({ team }) {
  if (!team) return <span className={styles.flagTbd}>?</span>;
  const f = getFlag(normalizeTeamName(team));
  if (f && f.startsWith('/')) {
    return <img src={f} alt={team} className={styles.flagImg} />;
  }
  if (f && f !== '\uD83C\uDFF4') return <span className={styles.flagEmoji}>{f}</span>;
  return <span className={styles.flagTbd}>?</span>;
}

/**
 * Ligne d'equipe : flag | nom | score (gauche) ou score | nom | flag (droite).
 * isLoser => grised + score barre (equipe eliminee).
 */
function TeamRow({ team, score, penalty, isWinner, isLoser, isRight }) {
  const name = team ? (getShortName(normalizeTeamName(team)) || team) : null;
  const scoreStr = fmtScore(score, penalty);

  return (
    <div className={[
      styles.teamRow,
      isWinner ? styles.teamWin  : '',
      isLoser  ? styles.teamLoss : '',
      !team    ? styles.teamTbd  : '',
      isRight  ? styles.teamRight : '',
    ].filter(Boolean).join(' ')}>
      {isRight && scoreStr != null && <span className={styles.teamScore}>{scoreStr}</span>}
      {isRight && <span className={styles.teamName}>{name ?? 'A det.'}</span>}
      <TeamFlag team={team} />
      {!isRight && <span className={styles.teamName}>{name ?? 'A det.'}</span>}
      {!isRight && scoreStr != null && <span className={styles.teamScore}>{scoreStr}</span>}
    </div>
  );
}

/** Carte match dans le bracket. */
function BracketMatch({ match, isRight = false, isFinal = false }) {
  const winner   = getWinner(match);
  const loser    = getLoser(match);
  const isPlayed = match?.status === 'played'
    || match?.status === 'forfait_a'
    || match?.status === 'forfait_b';
  const eqScore  = isPlayed && match?.scoreA === match?.scoreB;

  const venue = match?.venue ? (VENUE_LABELS[match.venue.trim().toUpperCase()] ?? match.venue) : null;
  const metaParts = [match?.time, venue].filter(Boolean);

  const card = (
    <div className={[
      styles.bMatch,
      isPlayed ? styles.bMatchPlayed : '',
      isFinal  ? styles.bMatchFinal  : '',
      !match   ? styles.bMatchEmpty  : '',
      match?.supabaseId ? styles.bMatchClickable : '',
    ].filter(Boolean).join(' ')}>
      <TeamRow
        team={match?.teamA}
        score={isPlayed ? match?.scoreA : null}
        penalty={eqScore ? match?.penaltyA : null}
        isWinner={winner === match?.teamA}
        isLoser={loser === match?.teamA}
        isRight={isRight}
      />
      <div className={styles.bMatchSep} />
      <TeamRow
        team={match?.teamB}
        score={isPlayed ? match?.scoreB : null}
        penalty={eqScore ? match?.penaltyB : null}
        isWinner={winner === match?.teamB}
        isLoser={loser === match?.teamB}
        isRight={isRight}
      />
      {metaParts.length > 0 && (
        <div className={styles.bMatchMeta}>
          {metaParts.join(' · ')}
        </div>
      )}
    </div>
  );

  if (match?.supabaseId) {
    return (
      <Link to={`/match/${match.supabaseId}`} className={styles.bMatchLink}>
        {card}
      </Link>
    );
  }
  return card;
}

/** Colonne d'un round. pairSize matches par groupe pour les connecteurs. */
function RoundCol({ matches, totalSlots, isRight = false, pairSize = 2 }) {
  const slots = Array.from({ length: totalSlots }, (_, i) => matches[i] ?? null);
  const pairs = [];
  for (let i = 0; i < slots.length; i += pairSize) {
    pairs.push(slots.slice(i, i + pairSize));
  }

  return (
    <div className={[styles.col, styles['slots' + totalSlots]].join(' ')}>
      {pairs.map((pair, pi) => (
        <div
          key={pi}
          className={[
            styles.pairGroup,
            pairSize > 1 ? (isRight ? styles.pairRight : styles.pairLeft) : '',
          ].filter(Boolean).join(' ')}
        >
          {pair.map((match, mi) => (
            <div key={mi} className={styles.pairSlot}>
              <BracketMatch match={match} isRight={isRight} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function BracketView({ matches }) {
  const { r16L, r16R, qfL, qfR, sfL, sfR, fin, third } = useMemo(() => {
    // Projection automatique : les gagnants montent seuls dans les tours suivants.
    const { r16, qf, sf, finale, third: thirdPlace } = buildBracket(matches);
    return {
      r16L:  r16.slice(0, 4),
      r16R:  r16.slice(4, 8),
      qfL:   qf.slice(0, 2),
      qfR:   qf.slice(2, 4),
      sfL:   sf[0] ?? null,
      sfR:   sf[1] ?? null,
      fin:   finale ?? null,
      third: thirdPlace ?? null,
    };
  }, [matches]);

  return (
    <div className={styles.bracketScroll}>
      <div className={styles.bracket}>

        {/* Gauche : R16 -> QF -> SF */}
        <RoundCol matches={r16L} totalSlots={4} isRight={false} pairSize={2} />
        <RoundCol matches={qfL}  totalSlots={2} isRight={false} pairSize={2} />

        {/* SF gauche */}
        <div className={[styles.col, styles['slots1'], styles.colSF].join(' ')}>
          <div className={[styles.pairGroup, styles.pairSfLeft].join(' ')}>
            <div className={styles.pairSlot}>
              <BracketMatch match={sfL} isRight={false} />
            </div>
          </div>
        </div>

        {/* Centre : Finale + 3e place */}
        <div className={styles.colCenter}>
          <div className={styles.centerHalf}>
            <div className={styles.centerLabel}>
              <span className={styles.centerIcon}>🏆</span> Grande Finale
            </div>
            <BracketMatch match={fin} isFinal />
          </div>
          <div className={styles.centerDivider} />
          <div className={styles.centerHalf}>
            <div className={styles.centerLabel}>
              <span className={styles.centerIcon}>🥉</span> 3e Place
            </div>
            <BracketMatch match={third} isFinal />
          </div>
        </div>

        {/* Droite : SF -> QF -> R16 (miroir) */}
        <div className={[styles.col, styles['slots1'], styles.colSF].join(' ')}>
          <div className={[styles.pairGroup, styles.pairSfRight].join(' ')}>
            <div className={styles.pairSlot}>
              <BracketMatch match={sfR} isRight />
            </div>
          </div>
        </div>

        <RoundCol matches={qfR}  totalSlots={2} isRight pairSize={2} />
        <RoundCol matches={r16R} totalSlots={4} isRight pairSize={2} />

      </div>

      {/* Legende rounds */}
      <div className={styles.legend}>
        <div className={styles.legendCol}>1/8</div>
        <div className={styles.legendCol}>Quarts</div>
        <div className={styles.legendCol}>Demis</div>
        <div className={styles.legendCenter}>Finale</div>
        <div className={styles.legendCol}>Demis</div>
        <div className={styles.legendCol}>Quarts</div>
        <div className={styles.legendCol}>1/8</div>
      </div>
    </div>
  );
}
