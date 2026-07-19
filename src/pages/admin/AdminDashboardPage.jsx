import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getMatches, syncOfflineQueue, getOfflineQueue, syncFromGoogleSheets, exportBackupJSON, restoreBackupJSON } from '../../services/adminService';
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
  const [journeeFilter, setJourneeFilter] = useState('');       // '' = toutes les journées
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncMsg,      setSyncMsg]      = useState('');
  const [importing,    setImporting]    = useState(false);
  const [syncing,      setSyncing]      = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [backing,      setBacking]      = useState(false);
  const [restoring,    setRestoring]    = useState(false);

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
      const detail = e?.details ?? e?.hint ?? e?.code ?? '';
      alert('Erreur import : ' + e.message + (detail ? `\n\nDétail : ${detail}` : ''));
      console.error('[importExcel]', e);
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
      // Auto-backup silencieux après chaque sync réussi
      try { await exportBackupJSON(); } catch (_) {}
    } catch (e) {
      const detail = e?.details ?? e?.hint ?? e?.code ?? '';
      const isLoadFailed = e.message?.includes('Load failed') || e.message?.includes('fetch');
      const msg = isLoadFailed
        ? 'Impossible de télécharger le Google Sheet — vérifiez que le fichier est partagé publiquement (Partager → Tous les utilisateurs → Lecteur)'
        : e.message + (detail ? ` (${detail})` : '');
      setSyncMsg('⚠️ Erreur sync : ' + msg);
      console.error('[syncGSheets]', e);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 12000);
    }
  }

  async function handleBackup() {
    setBacking(true);
    try {
      const backup = await exportBackupJSON();
      const total = (backup.matches?.length ?? 0) + (backup.match_events?.length ?? 0) + (backup.suspensions?.length ?? 0);
      setSyncMsg(`✅ Backup téléchargé — ${total} enregistrements exportés`);
    } catch (e) {
      setSyncMsg('⚠️ Erreur backup : ' + e.message);
    } finally {
      setBacking(false);
      setTimeout(() => setSyncMsg(''), 6000);
    }
  }

  async function handleRestore() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      setRestoring(true);
      try {
        const text = await file.text();
        const backup = JSON.parse(text);
        if (!confirm(`⚠️ Restaurer le backup du ${backup.exportedAt?.slice(0,16).replace('T',' ')} ?\n${backup.matches?.length ?? 0} matchs, ${backup.match_events?.length ?? 0} événements, ${backup.suspensions?.length ?? 0} suspensions.\n\nContinuer ?`)) return;
        const results = await restoreBackupJSON(backup);
        const total = Object.values(results).reduce((a, b) => a + b, 0);
        setSyncMsg(`✅ Restauration réussie — ${total} enregistrements restaurés`);
        loadMatches();
      } catch (err) {
        setSyncMsg('⚠️ Erreur restauration : ' + err.message);
      } finally {
        setRestoring(false);
        setTimeout(() => setSyncMsg(''), 8000);
      }
    };
    input.click();
  }

  async function handleExportExcel() {
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
        const reStr = `(<c\\s[^>]*r="${ref}"[^>]*>(?:(?!<[/]c>)[\\s\\S])*?<v>)[^<]*(</v>)`;
        const re = new RegExp(reStr, 'g');
        if (re.test(newXml)) {
          newXml = newXml.replace(
            new RegExp(reStr, 'g'),
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
    if (filter === 'live')     return m.status === 'live';
    if (filter === 'upcoming') return m.status === 'upcoming';
    if (filter === 'played')   return m.status === 'played' || m.status === 'forfait_a' || m.status === 'forfait_b';
    return true;
  }).filter(m => !journeeFilter || String(m.journee) === journeeFilter);

  const liveCount = matches.filter(m => m.status === 'live').length;

  const formatDate = (d) => {
    if (!d) return '—';
    // Forcer parsing local pour éviter le décalage UTC (ex: "2026-05-15" → veille en EST)
    const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('fr-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.titleLogo}>⚽</div>
          <div>
            <h1 className={styles.title}>QCN Admin</h1>
            <p className={styles.email}>{session?.user?.email}</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <a href="/" className={styles.linkBtn}>← App publique</a>
          <Link to="/admin/gestion" className={styles.gestionBtn}>📅 Gestion</Link>
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
        <div className={styles.actionsGrid}>
          <button onClick={handleSyncGSheets} disabled={syncing} className={styles.actionPrimary}>
            {syncing ? '⏳ Sync en cours…' : '🔄 Synchroniser Google Sheets'}
          </button>
          <button onClick={handleImportExcel} disabled={importing} className={`${styles.actionBtn} ${styles.actionBtnImport}`}>
            {importing ? '⏳…' : '📥 Import Excel local'}
          </button>
          <button onClick={handleExportExcel} disabled={exporting} className={`${styles.actionBtn} ${styles.actionBtnExport}`}>
            {exporting ? '⏳…' : '📤 Exporter XLSX'}
          </button>
          <button onClick={handleBackup} disabled={backing} className={`${styles.actionBtn} ${styles.actionBtnBackup}`}>
            {backing ? '⏳…' : '💾 Backup JSON'}
          </button>
          <button onClick={handleRestore} disabled={restoring} className={`${styles.actionBtn} ${styles.actionBtnRestore}`}>
            {restoring ? '⏳…' : '📂 Restaurer backup'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{matches.length}</span>
          <span className={styles.statKey}>Total</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{matches.filter(m => m.status === 'played' || m.status === 'forfait_a' || m.status === 'forfait_b').length}</span>
          <span className={styles.statKey}>Joués</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{matches.filter(m => m.status === 'upcoming').length}</span>
          <span className={styles.statKey}>À venir</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue} style={liveCount > 0 ? {color:'#ef4444'} : {}}>{liveCount}</span>
          <span className={styles.statKey}>Live</span>
        </div>
      </div>

      {/* Filtres */}
      <div className={styles.filtersBar}>
        {['live', 'upcoming', 'played', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`${styles.filterBtn} ${filter === f ? styles.active : ''} ${f === 'live' ? styles.filterLive : ''}`}
          >
            {f === 'live'     ? `🔴 En cours${liveCount > 0 ? ` (${liveCount})` : ''}` :
             f === 'upcoming' ? `⏱ À venir (${matches.filter(m=>m.status==='upcoming').length})` :
             f === 'played'   ? `✓ Joués` : '☰ Tous'}
          </button>
        ))}
        <select
          className={styles.journeeSelect}
          value={journeeFilter}
          onChange={e => setJourneeFilter(e.target.value)}
        >
          <option value="">Toutes les journées</option>
          {[...new Set(matches.map(m => m.journee).filter(Boolean))].sort((a,b)=>a-b).map(j => (
            <option key={j} value={String(j)}>Journée {j}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading && <p className={styles.info}>Chargement des matchs...</p>}
      {error   && <p className={styles.errorMsg}>{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className={styles.info}>Aucun match. Importez d&apos;abord les données Excel.</p>
      )}

      <div className={styles.list}>
        {(() => {
          const renderCard = (m) => {
            const isForfait = m.status === 'forfait_a' || m.status === 'forfait_b';
            const cardClass = [
              styles.matchCard,
              m.status === 'played' ? styles.matchCardPlayed : '',
              m.status === 'live'   ? styles.matchCardLive   : '',
              isForfait             ? styles.matchCardForfait : '',
            ].filter(Boolean).join(' ');
            return (
              <Link to={`/admin/match/${m.id}`} key={m.id} className={cardClass}>
                <div className={styles.matchMeta}>
                  <span className={styles.date}>{formatDate(m.date)}</span>
                  {m.time && <span className={styles.time}>{m.time}</span>}
                  <span className={styles.venue}>{m.venue}</span>
                  <span className={`${styles.status} ${isForfait ? styles.forfait : styles[m.status] || ''}`}>
                    {m.status === 'live'                                  ? '🔴 LIVE' :
                     m.status === 'played'                                ? '✓ Joué' :
                     m.status === 'forfait_a' || m.status === 'forfait_b' ? '🚫 Forfait' : '⏱ À venir'}
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
            );
          };

          // Groupes par journée (matchs de groupe)
          const grouped = {};
          for (const m of filtered) {
            if (m.phase) continue; // les matchs de phase finale sont groupés à part
            const j = m.journee ?? 0;
            (grouped[j] ??= []).push(m);
          }
          const journees = Object.keys(grouped).map(Number).filter(j => j > 0).sort((a, b) => a - b);

          // Groupes de phase finale (par tour)
          const PHASE_ORDER = ['1/8e de finale', 'Quarts de finale', 'Demi-finales', 'Finale'];
          const PHASE_LABELS = {
            '1/8e de finale': '1/8 de finale', 'Quarts de finale': 'Quarts de finale',
            'Demi-finales': 'Demi-finales', 'Finale': 'Finale',
          };
          const phaseGroups = {};
          for (const m of filtered) {
            if (m.phase) (phaseGroups[m.phase] ??= []).push(m);
          }
          const phases = PHASE_ORDER.filter(p => phaseGroups[p]);

          return (
            <>
              {journees.map(j => (
                <div key={`j${j}`} className={styles.journeeGroup}>
                  <div className={styles.journeeHeader}>
                    <span className={styles.journeeTitle}>Journée {j}</span>
                    <span className={styles.journeeCount}>{grouped[j].length} match{grouped[j].length > 1 ? 's' : ''}</span>
                  </div>
                  {grouped[j].map(renderCard)}
                </div>
              ))}
              {phases.map(p => (
                <div key={p} className={styles.journeeGroup}>
                  <div className={styles.journeeHeader}>
                    <span className={styles.journeeTitle}>🏆 Phase finale — {PHASE_LABELS[p] ?? p}</span>
                    <span className={styles.journeeCount}>{phaseGroups[p].length} match{phaseGroups[p].length > 1 ? 's' : ''}</span>
                  </div>
                  {phaseGroups[p].map(renderCard)}
                </div>
              ))}
            </>
          );
        })()}
      </div>
    </div>
  );
}
