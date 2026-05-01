import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHouse, faCalendarDays, faTrophy, faChartBar, faShield } from '@fortawesome/free-solid-svg-icons';
import styles from './TopBar.module.css';
import SearchBar from '../shared/SearchBar';

const NAV_ITEMS = [
  { to: '/',              icon: faHouse,        label: 'Accueil'       },
  { to: '/qualification', icon: faCalendarDays, label: 'Qualification'  },
  { to: '/finale',        icon: faTrophy,       label: 'Phase Finale'   },
  { to: '/classement',    icon: faChartBar,     label: 'Classement'     },
  { to: '/equipes',       icon: faShield,       label: 'Équipes'        },
];

export default function TopBar() {
  return (
    <header className={styles.bar}>
      <NavLink to="/" className={styles.logo}>
        <img
          src="/assets/logo.jpg"
          alt="QCN Logo"
          className={styles.logoImg}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <span className={styles.logoText}>
          QCN
          <span className={styles.logoSub}>2026</span>
        </span>
      </NavLink>

      <nav className={styles.desktopNav}>
        {NAV_ITEMS.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`
            }
          >
            <FontAwesomeIcon icon={icon} style={{ marginRight: '6px' }} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.searchWrap}>
        <SearchBar />
      </div>
    </header>
  );
}
