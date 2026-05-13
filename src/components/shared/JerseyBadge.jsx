/**
 * JerseyShape — T-shirt SVG avec 1 ou 2 couleurs (50/50 gauche/droite)
 * + JerseyBadge — badge cliquable compact (pour MatchPage)
 * + JerseyPanel — panneau 3 maillots (pour EquipePage)
 * + JerseyModal — modal complet (pour MatchPage)
 */
import { useState } from 'react';
import { parseColors } from '../../config/jerseyConfig';
import styles from './JerseyBadge.module.css';

// ── SVG T-shirt shape ─────────────────────────────────────────────────────────
// viewBox 0 0 48 44
const TSHIRT_PATH = 'M12,2 C14,6 18,8 24,8 C30,8 34,6 36,2 L48,10 L48,18 L38,16 L38,44 L10,44 L10,16 L0,18 L0,10 Z';

/**
 * Retourne le(s) style(s) de remplissage pour le t-shirt.
 * - 1 couleur : fill solid
 * - 2 couleurs : linearGradient 50/50
 */
function TShirt({ colorStr, size = 32, id }) {
  const colors = parseColors(colorStr);
  if (!colors) return null;

  const gradId = `grad-${id}`;
  const isBicolor = colors.length === 2;
  const needsBorder = colors[0] === '#f8f8f8' || colors[1] === '#f8f8f8';

  return (
    <svg
      viewBox="0 0 48 44"
      width={size}
      height={size * (44 / 48)}
      xmlns="http://www.w3.org/2000/svg"
      className={styles.tshirtSvg}
    >
      {isBicolor && (
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="50%" stopColor={colors[0]} />
            <stop offset="50%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
      )}
      <path
        d={TSHIRT_PATH}
        fill={isBicolor ? `url(#${gradId})` : colors[0]}
        stroke={needsBorder ? '#d1d5db' : 'rgba(0,0,0,0.15)'}
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ── Badge compact (1 maillot principal + cliquable) ───────────────────────────
export function JerseyBadge({ colorStr, onClick, label }) {
  if (!colorStr) return null;
  return (
    <button className={styles.badge} onClick={onClick} title="Voir les maillots" type="button">
      <TShirt colorStr={colorStr} size={22} id={`badge-${colorStr}`} />
      {label && <span className={styles.badgeLabel}>{label}</span>}
    </button>
  );
}

// ── Carte maillot (1 seul type) ───────────────────────────────────────────────
export function JerseyCard({ colorStr, label, size = 44 }) {
  if (!colorStr) {
    return (
      <div className={styles.jerseyCard}>
        <div className={styles.jerseyEmpty}>—</div>
        <span className={styles.jerseyLabel}>{label}</span>
      </div>
    );
  }
  return (
    <div className={styles.jerseyCard}>
      <TShirt colorStr={colorStr} size={size} id={`card-${label}-${colorStr}`} />
      <span className={styles.jerseyLabel}>{label}</span>
      <span className={styles.jerseyColors}>{colorStr}</span>
    </div>
  );
}

// ── Panneau 3 maillots (page équipe) ─────────────────────────────────────────
export function JerseyPanel({ jerseys }) {
  if (!jerseys) return null;
  return (
    <div className={styles.panel}>
      <JerseyCard colorStr={jerseys.principal}  label="Principal"   size={52} />
      <JerseyCard colorStr={jerseys.secondaire} label="Secondaire"  size={52} />
      <JerseyCard colorStr={jerseys.gardien}    label="Gardien"     size={52} />
    </div>
  );
}

// ── Modal complet (page match — 2 équipes) ────────────────────────────────────
export function JerseyModal({ teamA, teamB, jerseysA, jerseysB, onClose }) {
  if (!jerseysA && !jerseysB) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
        <h3 className={styles.modalTitle}>Maillots</h3>
        <div className={styles.modalContent}>
          {[{ team: teamA, jerseys: jerseysA }, { team: teamB, jerseys: jerseysB }].map(({ team, jerseys }) => (
            <div key={team} className={styles.modalTeam}>
              <div className={styles.modalTeamName}>{team}</div>
              <div className={styles.modalJerseys}>
                <JerseyCard colorStr={jerseys?.principal}  label="Principal"  size={44} />
                <JerseyCard colorStr={jerseys?.secondaire} label="Secondaire" size={44} />
                <JerseyCard colorStr={jerseys?.gardien}    label="Gardien"    size={44} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
