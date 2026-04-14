import { NavLink } from 'react-router-dom';
import styles from './BottomNav.module.css';

const NAV_ITEMS = [
  { to: '/',              icon: '🏠', label: 'Accueil'      },
  { to: '/qualification', icon: '📅', label: 'Qualification' },
  { to: '/finale',        icon: '🏆', label: 'Finale'        },
  { to: '/classement',    icon: '📊', label: 'Classement'    },
  { to: '/equipes',       icon: '🛡️', label: 'Équipes'       },
];

export default function BottomNav() {
  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `${styles.link}${isActive ? ` ${styles.active}` : ''}`
          }
        >
          <span className={styles.icon}>{icon}</span>
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
