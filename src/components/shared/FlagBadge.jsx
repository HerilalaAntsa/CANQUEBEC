import { Link } from 'react-router-dom';
import { getFlag, generateSlug } from '../../config/teams';
import styles from './FlagBadge.module.css';

/**
 * Affiche le drapeau emoji + nom d'une équipe
 * @param {string} team - Nom normalisé de l'équipe
 * @param {'sm'|'md'|'lg'|'xl'} size
 * @param {boolean} link - Si true, wrap dans un Link vers la fiche équipe
 */
export default function FlagBadge({ team, size = 'md', link = false, className = '' }) {
  if (!team) return null;

  const flag = getFlag(team);
  const slug = generateSlug(team);

  const content = (
    <span className={`${styles.badge} ${styles[size]} ${className}`}>
      <span className={styles.flag} role="img" aria-label={team}>{flag}</span>
      <span className={styles.name}>{team}</span>
    </span>
  );

  if (link) {
    return (
      <Link to={`/equipe/${slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </Link>
    );
  }

  return content;
}
