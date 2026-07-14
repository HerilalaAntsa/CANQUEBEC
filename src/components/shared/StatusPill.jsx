import styles from './StatusPill.module.css';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

/**
 * Pill de statut d'un match
 */
export default function StatusPill({ match }) {
  if (!match) return null;

  // Guard: null or invalid date must not trigger 'Terminé'
  const rawDate = match.date ? String(match.date).slice(0, 10) + 'T00:00:00' : null;
  const matchDay = rawDate ? new Date(rawDate) : null;
  if (matchDay) matchDay.setHours(0, 0, 0, 0);
  const isValidDay = matchDay && !isNaN(matchDay.getTime());

  let variant, label;

  if (match.status === 'played') {
    variant = 'played';
    label   = 'Terminé';
  } else if (match.status === 'forfait_a' || match.status === 'forfait_b') {
    variant = 'forfait';
    label   = 'Forfait';
  } else if (match.status === 'live') {
    variant = 'live';
    label   = '🔴 En cours';
  } else if (match.status === 'postponed') {
    variant = 'postponed';
    label   = '⚠️ Reporté';
  } else if (isValidDay && matchDay.getTime() === TODAY.getTime()) {
    variant = 'today';
    label   = "Aujourd'hui";
  } else if (isValidDay && matchDay < TODAY) {
    variant = 'played';
    label   = 'Terminé';
  } else {
    variant = 'upcoming';
    label   = 'À venir';
  }

  return (
    <span className={`${styles.pill} ${styles[variant]}`}>
      {label}
    </span>
  );
}
