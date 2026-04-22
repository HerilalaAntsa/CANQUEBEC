import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getMatches, syncOfflineQueue, getOfflineQueue, syncFromGoogleSheets } from '../../services/adminService';
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
  const [syncing,      setSyncing]      = useState(false);
  const [exporting,    setExporting]    = useState(false);

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

  async function handleSyncGSheets() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const { count } = await syncFromGoogleSheets();
      setSyncMsg(`✅ Google Sheets synchronisé — ${count} matchs mis à jour`);
      loadMatches();
    } catch (e) {
      setSyncMsg('⚠️ Erreur sync Google Sheets : ' + e.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 6000);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    setSyncMsg('');
    try {
      // 1. Fetch le fichier template binaire
      const res = await fetch('/data/HORAIRE_2026.xlsx');
      if (!res.ok) throw new Error('Impossible de charger HORAIRE_2026.xlsx');
      const arrayBuf = await res.arrayBuffer();

      // 2. Index des scores par clé journee:TEAMA:TEAMB
      //    On utilise XLSX uniquement pour lire les données (pas écrire)
      const wb = XLSX.read(arrayBuf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      const scoreMap = {};
      for (const m of matches) {
        if (m.score_a === null || m.score_b === null) continue;
        const key = `${m.journee}:${String(m.team_a).toUpperCase().trim()}:${String(m.team_b).toUpperCase().trim()}`;
        scoreMap[key] = { scoreA: m.score_a, scoreB: m.score_b };
      }

      // 3. Construire la map cellRef → nouvelle valeur
      //    en parcourant les lignes pour trouver les bons matchs
      const cellUpdates = {}; // ex: { 'I3': 2, 'J3': 1 }
      let currentJournee = 0;
      let inPhaseFinale = false;
      let updated = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => c === null)) continue;
        if (row[1] === 'Date' || row[0] === 'ID ') continue;
        if (typeof row[1] === 'string' && row[1].toUpperCase().includes('PHASE FINALE')) { inPhaseFinale = true; continue; }
        if (inPhaseFinale) continue;
        if (typeof row[1] === 'string' && row[1].toUpperCase().startsWith('JOURN\u00c9E')) {
          const m2 = row[1].match(/(\d+)/);
          if (m2) currentJournee = parseInt(m2[1]);
          continue;
        }
        const teamA = String(row[5] ?? '').toUpperCase().trim();
        const teamB = String(row[7] ?? '').toUpperCase().trim();
        if (!teamA || !teamB) continue;
        const score = scoreMap[`${currentJournee}:${teamA}:${teamB}`];
        if (!score) continue;
        // row i → Excel row i+1 (1-based), col 8=I, col 9=J
        cellUpdates[`I${i + 1}`] = score.scoreA;
        cellUpdates[`J${i + 1}`] = score.scoreB;
        updated++;
      }

      // 4. Ouvrir le ZIP original, modifier le XML de la feuille 1 chirurgicalement
      const zip = await JSZip.loadAsync(arrayBuf);
      const sheetPath = 'xl/worksheets/sheet1.xml';
      const sheetXml = await zip.file(sheetPath).async('string');

      // Pour chaque cellule à mettre à jour, remplacer la valeur <v>...</v>
      // en ciblant la balise <c r="I3" ...><v>...</v></c>
      let newXml = sheetXml;
      for (const [ref, val] of Object.entries(cellUpdates)) {
        // Regex : trouve <c r="REF" ...> ... <v>ANCIEN</v> ... </c>
        // On remplace seulement le contenu de <v>
        const re = new RegExp(
          `(<c\\s[^>]*r="${ref}"[^>]*>(?:(?!<\/c>)[\\s\\S])*?<v>)[^<]*(</v>)`,
          'g'
        );
        if (re.test(newXml)) {
          newXml = newXml.replace(
            new RegExp(`(<c\\s[^>]*r="${ref}"[^>]*>(?:(?!<\/c>)[\\s\\S])*?<v>)[^<]*(</v>)`, 'g'),
            `$1${val}$2`
          );
        } else {
          // La cellule est vide dans le template — il faut l'insérer dans la bonne <row>
          const rowNum = ref.replace(/[A-Z]+/, '');
          const colLetter = ref.replace(/\d+/, '');
          // Trouver la ligne <row r="N" ...>...</row> et y injecter la cellule
          newXml = newXml.replace(
            new RegExp(`(<row[^>]*\\br="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`),
            (_, open, content, close) => {
              const newCell = `<c r="${ref}"><v>${val}</v></c>`;
              // Insérer avant la première cellule dont la colonne est > colLetter
              const inserted = content.replace(
                /(<c\s[^>]*r="([A-Z]+)\d+")/, 
                (m3, tag, col) => col > colLetter ? newCell + m3 : m3
              );
              return open + (inserted === content ? content + newCell : inserted) + close;
            }
          );
        }
      }

      zip.file(sheetPath, newXml);

      // 5. Re-générer le ZIP et déclencher le téléchargement
      const outBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
      const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HORAIRE_2026_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setSyncMsg(`✅ Export réussi — ${updated} score(s) mis à jour`);
    } catch (e) {
      setSyncMsg('⚠️ Erreur export : ' + e.message);
    } finally {
      setExporting(false);
      setTimeout(() => setSyncMsg(''), 6000);
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
      {syncMsg && <div className={syncMsg.startsWith('⚠️') ? styles.syncMsgError : styles.syncMsg}>{syncMsg}</div>}

      {/* Actions */}
      <div className={styles.actions}>
        <button onClick={handleSyncGSheets} disabled={syncing} className={styles.gsheetsBtn}>
          {syncing ? '⏳ Sync en cours...' : '🔄 Sync Google Sheets'}
        </button>
        <button onClick={handleImportExcel} disabled={importing} className={styles.importBtn}>
          {importing ? 'Import en cours...' : '📥 Importer depuis l\'Excel local'}
        </button>
        <button onClick={handleExportExcel} disabled={exporting} className={styles.exportBtn}>
          {exporting ? '⏳ Export en cours...' : '📤 Exporter XLSX'}
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
