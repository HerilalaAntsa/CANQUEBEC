import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faCalendarDays, faTrophy, faChartBar, faShield } from '@fortawesome/free-solid-svg-icons';
import styles from './BottomNav.module.css';

const NAV_ITEMS = [
  { to: '/',              icon: faHouse,        label: 'Accueil'      },
  { to: '/qualification', icon: faCalendarDays, label: 'Qualification' },
  { to: '/finale',        icon: faTrophy,       label: 'Finale'        },
  { to: '/classement',    icon: faChartBar,     label: 'Classement'    },
  { to: '/equipes',       icon: faShield,       label: 'Équipes'       },
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
          <span className={styles.icon}>
            <FontAwesomeIcon icon={icon} />
          </span>
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
