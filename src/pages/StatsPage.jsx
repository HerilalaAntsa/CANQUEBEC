import styles from './StatsPage.module.css';

export default function StatsPage() {
  return (
    <div className={styles.page}>
      <div className="container">
        <h1 className={styles.title}>Statistiques</h1>
        <div className={styles.soon}>
          <span className={styles.soonIcon}>⚽</span>
          <h2 className={styles.soonTitle}>Disponible dès le coup d'envoi</h2>
          <p className={styles.soonText}>
            Les statistiques de buteurs et passeurs seront affichées ici
            dès que la saison sera lancée.
          </p>
          <p className={styles.soonDate}>Début de saison : 15 mai 2026</p>
        </div>
      </div>
    </div>
  );
}
