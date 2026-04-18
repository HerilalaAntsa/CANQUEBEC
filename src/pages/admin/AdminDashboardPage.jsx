import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getMatches, syncOfflineQueue, getOfflineQueue } from '../../services/adminService';
import { useLeagueData } from '../../services/dataStore';
import { importMatchesFromExcel } from '../../services/adminService';
import styles from './AdminDashboard.module.css';

export default function AdminDashboardPage() {
  const { logout, session } = useAuth();
  const { matches: excelMatches } = useLeagueData();

  const [matches,      setMatches]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [filter,       setFilter]       = useState('upcoming'); // 'all' | 'upcoming' | 'played'
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncMsg,      setSyncMsg]      = useState('');
  const [importing,    setImporting]    = useState(false);

  useEffect(() => {
    loadMatches();
    setOfflineCount(getOfflineQueue().length);
  }, []);

  async function loadMatches() {
    try {
      const data = await getMatches();
      setMatches(data);
    } catch (e) {
      setError('Impossible de charger les matchs : ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    const result = await syncOfflineQueue();
    setSyncMsg(`✅ ${result.synced} op. synchronisées${result.failed ? `, ${result.failed} échouées` : ''}`);
    setOfflineCount(getOfflineQueue().length);
    setTimeout(() => setSyncMsg(''), 4000);
    loadMatches();
  }

  async function handleImportExcel() {
    if (!excelMatches?.length) return alert('Aucun fichier Excel chargé dans l\'app.');
    setImporting(true);
    try {
      const count = await importMatchesFromExcel(excelMatches);
      alert(`✅ ${count} matchs importés depuis l'Excel.`);
      loadMatches();
    } catch (e) {
      alert('Erreur import : ' + e.message);
    } finally {
      setImporting(false);
    }
  }

  const filtered = matches.filter(m => {
    if (filter === 'upcoming') return m.status === 'upcoming';
    if (filter === 'played')   return m.status === 'played';
    return true;
  });

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-CA', { weekday: 'short', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>CNQ Admin</h1>
          <p className={styles.email}>{session?.user?.email}</p>
        </div>
        <div className={styles.headerActions}>
          <a href="/" className={styles.linkBtn}>← App publique</a>
          <button onClick={logout} className={styles.logoutBtn}>Déconnexion</button>
        </div>
      </header>

      {/* Offline banner */}
      {offlineCount > 0 && (
        <div className={styles.offlineBanner}>
          ⚠️ {offlineCount} opération(s) en attente de synchronisation.
          <button onClick={handleSync} className={styles.syncBtn}>Synchroniser maintenant</button>
        </div>
      )}
      {syncMsg && <div className={styles.syncMsg}>{syncMsg}</div>}

      {/* Actions */}
      <div className={styles.actions}>
        <button onClick={handleImportExcel} disabled={importing} className={styles.importBtn}>
          {importing ? 'Import en cours...' : '📥 Importer depuis l\'Excel'}
        </button>
        <div className={styles.filters}>
          {['upcoming', 'played', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`}
            >
              {f === 'upcoming' ? 'À venir' : f === 'played' ? 'Joués' : 'Tous'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading && <p className={styles.info}>Chargement des matchs...</p>}
      {error   && <p className={styles.errorMsg}>{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className={styles.info}>Aucun match. Importez d&apos;abord les données Excel.</p>
      )}

      <div className={styles.list}>
        {filtered.map(m => (
          <Link to={`/admin/match/${m.id}`} key={m.id} className={styles.matchCard}>
            <div className={styles.matchMeta}>
              <span className={styles.journee}>J{m.journee}</span>
              <span className={styles.date}>{formatDate(m.date)}</span>
              <span className={styles.venue}>{m.venue}</span>
              <span className={`${styles.status} ${styles[m.status]}`}>
                {m.status === 'played' ? 'Joué' : 'À venir'}
              </span>
            </div>
            <div className={styles.matchTeams}>
              <span className={styles.team}>{m.team_a}</span>
              <span className={styles.score}>
                {m.score_a !== null ? `${m.score_a} — ${m.score_b}` : 'vs'}
              </span>
              <span className={styles.team}>{m.team_b}</span>
            </div>
            <span className={styles.editHint}>Modifier →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
