import styles from './StatusPill.module.css';

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

/**
 * Pill de statut d'un match
 */
export default function StatusPill({ match }) {
  if (!match) return null;

  const matchDay = new Date(match.date);
  matchDay.setHours(0, 0, 0, 0);

  let variant, label;

  if (match.status === 'played') {
    variant = 'played';
    label   = 'Terminé';
  } else if (match.status === 'live') {
    variant = 'live';
    label   = '🔴 En cours';
  } else if (match.status === 'postponed') {
    variant = 'postponed';
    label   = '⚠️ Reporté';
  } else if (matchDay.getTime() === TODAY.getTime()) {
    variant = 'today';
    label   = "Aujourd'hui";
  } else if (matchDay < TODAY) {
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
