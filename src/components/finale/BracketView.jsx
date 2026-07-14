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
import { getFlag, getShortName } from '../../config/teams';
import styles from './BracketView.module.css';

// Ordre et libellés des rounds (étendable)
export const ROUND_KEYS = [
  '1/8e de finale',
  'Quarts de finale',
  'Demi-finales',
  'Finale',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retourne le nom de l'équipe gagnante, null si match non joué */
function getWinner(m) {
  if (!m) return null;
  if (m.status === 'forfait_a') return m.teamB;
  if (m.status === 'forfait_b') return m.teamA;
  if (m.status !== 'played') return null;
  const a = m.scoreA ?? -1;
  const b = m.scoreB ?? -2;
  if (a > b) return m.teamA;
  if (b > a) return m.teamB;
  return null; // nul (rare en KO)
}

/** Trie par date puis par heure */
function sortByTime(arr) {
  return [...arr].sort((a, b) => {
    const ka = `${a.date ?? '9999'}${a.time ?? '99:99'}`;
    const kb = `${b.date ?? '9999'}${b.time ?? '99:99'}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
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

/** Affiche le drapeau d'une équipe (SVG ou emoji) */
function TeamFlag({ team }) {
  if (!team) return <span className={styles.flagEmpty}>?</span>;
  const f = getFlag(team);
  if (!f || f === '🏴') return <span className={styles.flagEmoji}>🏴</span>;
  if (f.startsWith('/')) {
    return <img src={f} alt={team} className={styles.flagImg} />;
  }
  return <span className={styles.flagEmoji}>{f}</span>;
}

/**
 * Une ligne d'équipe dans une carte match du bracket.
 * side='left'   → flag | nom | score
 * side='right'  → score | nom | flag (miroir)
 * side='center' → flag | nom | score (idem left, pour la finale)
 */
function TeamRow({ team, score, isWinner, side }) {
  const name = team ? (getShortName(team) || team) : null;
  const isRight = side === 'right';

  return (
    <div className={[
      styles.teamRow,
      isWinner ? styles.teamWin : '',
      !team ? styles.teamTbd : '',
    ].join(' ')}>
      {isRight && score != null && <span className={styles.teamScore}>{score}</span>}
      {isRight && <span className={styles.teamName}>{name ?? 'À déterm.'}</span>}
      <TeamFlag team={team} />
      {!isRight && <span className={styles.teamName}>{name ?? 'À déterm.'}</span>}
      {!isRight && score != null && <span className={styles.teamScore}>{score}</span>}
    </div>
  );
}

/**
 * Carte match dans le bracket.
 * - isTop / isBottom indiquent la position au sein de la paire (pour les connecteurs CSS)
 */
function BracketMatch({ match, side, isTop = false, isBottom = false }) {
  const winner = getWinner(match);
  const played = match?.status === 'played' || match?.status?.startsWith('forfait');

  const connClass = isTop ? styles.connTop : isBottom ? styles.connBottom : '';
  const isRight   = side === 'right';

  return (
    <div className={[
      styles.bMatch,
      played     ? styles.bMatchPlayed : '',
      isRight    ? styles.bMatchRight  : '',
      connClass,
    ].join(' ')}>
      <TeamRow
        team={match?.teamA}
        score={played ? match?.scoreA : null}
        isWinner={winner === match?.teamA}
        side={side}
      />
      <div className={styles.bMatchSep} />
      <TeamRow
        team={match?.teamB}
        score={played ? match?.scoreB : null}
        isWinner={winner === match?.teamB}
        side={side}
      />
      {match?.time && !played && (
        <div className={styles.bMatchTime}>{match.time}</div>
      )}
    </div>
  );
}

/**
 * Colonne de round.
 * Chaque slot a flex:1 → distribution automatique égale.
 * Les matches sont regroupés en paires pour dessiner les connecteurs.
 *   pairSize=2 : 2 matches → 1 connecteur vertical entre eux
 *   pairSize=1 : match seul (SF, ou colonne avec 1 seul match)
 */
function RoundCol({ matches, totalSlots, side, pairSize = 2 }) {
  // Compléter jusqu'à totalSlots avec null (placeholder TBD)
  const slots = Array.from({ length: totalSlots }, (_, i) => matches[i] ?? null);

  // Découper en paires
  const pairs = [];
  for (let i = 0; i < slots.length; i += pairSize) {
    pairs.push(slots.slice(i, i + pairSize));
  }

  const isRight = side === 'right';

  return (
    <div className={[styles.col, styles['colSlots' + totalSlots]].join(' ')}>
      {pairs.map((pair, pi) => (
        <div
          key={pi}
          className={[
            styles.pairGroup,
            pairSize > 1 ? (isRight ? styles.pairRight : styles.pairLeft) : '',
          ].join(' ')}
        >
          {pair.map((match, mi) => {
            const isTop    = pairSize > 1 && mi === 0;
            const isBottom = pairSize > 1 && mi === pair.length - 1;
            return (
              <div key={mi} className={styles.pairSlot}>
                <BracketMatch
                  match={match}
                  side={side}
                  isTop={isTop}
                  isBottom={isBottom}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function BracketView({ matches }) {
  const { r16L, r16R, qfL, qfR, sfL, sfR, fin, third } = useMemo(() => {
    const byRound = groupByRound(matches);

    const r16 = sortByTime(byRound['1/8e de finale']);
    const qf  = sortByTime(byRound['Quarts de finale']);
    const sf  = sortByTime(byRound['Demi-finales']);
    const fn  = sortByTime(byRound['Finale']);

    // Partage gauche / droite : premiers 4 à gauche, 4 suivants à droite
    return {
      r16L: r16.slice(0, 4),
      r16R: r16.slice(4, 8),
      qfL:  qf.slice(0, 2),
      qfR:  qf.slice(2, 4),
      sfL:  sf[0] ?? null,
      sfR:  sf[1] ?? null,
      fin:  fn[0] ?? null,
      third: fn[1] ?? null,
    };
  }, [matches]);

  const totalR16 = Math.max(r16L.length, 4);
  const totalQF  = Math.max(qfL.length, 2);

  return (
    <div className={styles.bracketScroll}>
      <div className={styles.bracket}>

        {/* ── Côté gauche ── */}
        <RoundCol matches={r16L} totalSlots={4} side="left" pairSize={2} />
        <RoundCol matches={qfL}  totalSlots={2} side="left" pairSize={2} />

        {/* SF gauche : 1 match seul, avec connecteur sortant vers le centre */}
        <div className={[styles.col, styles.colSlots1, styles.colSF].join(' ')}>
          <div className={styles.pairGroup}>
            <div className={styles.pairSlot}>
              <BracketMatch match={sfL} side="left" />
            </div>
          </div>
        </div>

        {/* ── Centre : Finale + 3e place ── */}
        <div className={[styles.col, styles.colCenter].join(' ')}>
          <div className={styles.centerTop}>
            <span className={styles.centerLabel}>🏆 GRANDE FINALE</span>
            <BracketMatch match={fin} side="center" />
          </div>
          <div className={styles.centerBot}>
            <span className={styles.centerLabel}>🥉 3ème PLACE</span>
            <BracketMatch match={third} side="center" />
          </div>
        </div>

        {/* ── Côté droit (miroir) ── */}
        <div className={[styles.col, styles.colSlots1, styles.colSF].join(' ')}>
          <div className={styles.pairGroup}>
            <div className={styles.pairSlot}>
              <BracketMatch match={sfR} side="right" />
            </div>
          </div>
        </div>

        <RoundCol matches={qfR}  totalSlots={2} side="right" pairSize={2} />
        <RoundCol matches={r16R} totalSlots={4} side="right" pairSize={2} />

      </div>

      {/* Légende rounds */}
      <div className={styles.legend}>
        <span>1/8e de finale</span>
        <span>Quarts</span>
        <span>Demi-finales</span>
        <span className={styles.legendCenter}>Finale · 3e place</span>
        <span>Demi-finales</span>
        <span>Quarts</span>
        <span>1/8e de finale</span>
      </div>
    </div>
  );
}
