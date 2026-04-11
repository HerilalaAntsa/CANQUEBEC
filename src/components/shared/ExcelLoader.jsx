import { useRef } from 'react';
import styles from './ExcelLoader.module.css';
import { useLeagueData } from '../../services/dataStore';

/**
 * Bouton fallback pour charger manuellement le fichier Excel horaire
 */
export default function ExcelLoader() {
  const { loadHoraireFile, loading } = useLeagueData();
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      loadHoraireFile(file);
      e.target.value = '';
    }
  };

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className={styles.hidden}
        onChange={handleChange}
        id="excel-upload"
      />
      <label htmlFor="excel-upload" className={styles.btn} aria-disabled={loading}>
        📂 Charger le fichier Excel
      </label>
      <p className={styles.hint}>Fichier HORAIRE_2026.xlsx</p>
    </div>
  );
}
