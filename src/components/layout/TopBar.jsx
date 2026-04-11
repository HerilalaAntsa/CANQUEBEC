import { NavLink } from 'react-router-dom';
import styles from './TopBar.module.css';
import SearchBar from '../shared/SearchBar';

const NAV_ITEMS = [
  { to: '/',           label: 'Accueil'    },
  { to: '/calendrier', label: '📅 Calendrier' },
  { to: '/classement', label: '🏆 Classement' },
  { to: '/stats',      label: '⚽ Stats'    },
  { to: '/equipes',    label: '🛡️ Équipes'  },
];

export default function TopBar() {
  return (
    <header className={styles.bar}>
      <NavLink to="/" className={styles.logo}>
        <img
          src="/assets/logo.jpg"
          alt="LNQ Logo"
          className={styles.logoImg}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <span className={styles.logoText}>
          LNQ
          <span className={styles.logoSub}>2026</span>
        </span>
      </NavLink>

      <nav className={styles.desktopNav}>
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`
            }
          >
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
