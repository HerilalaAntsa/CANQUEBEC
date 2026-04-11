import styles from './AppShell.module.css';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

export default function AppShell({ children }) {
  return (
    <div className={styles.shell}>
      <TopBar />
      <main className={styles.main}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
