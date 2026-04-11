import styles from './AppShell.module.css';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

const YEAR = new Date().getFullYear();

export default function AppShell({ children }) {
  return (
    <div className={styles.shell}>
      <TopBar />
      <main className={styles.main}>
        {children}
      </main>
      <footer className={styles.footer}>
        <span>© {YEAR} Ligue des Nations de Québec</span>
        <span className={styles.sep}>·</span>
        <span>Développé par <strong>Antsa Rakotomananjo</strong> — RAH</span>
      </footer>
      <BottomNav />
    </div>
  );
}
