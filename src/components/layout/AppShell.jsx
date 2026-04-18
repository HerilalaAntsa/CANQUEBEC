import { Outlet } from 'react-router-dom';
import styles from './AppShell.module.css';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

const YEAR = new Date().getFullYear();

export default function AppShell({ children }) {
  return (
    <div className={styles.shell}>
      <TopBar />
      <main className={styles.main}>
        {children ?? <Outlet />}
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <img
            src="/assets/logo-24.jpg"
            alt="Communauté Foot"
            className={styles.footerLogo}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div className={styles.footerText}>
            <span className={styles.footerCommunity}>Communauté Foot</span>
            <span className={styles.footerCopy}>© {YEAR} Québec Coupe des Nations · Développé par <strong>RAH</strong></span>
          </div>
        </div>
      </footer>
      <BottomNav />
    </div>
  );
}

