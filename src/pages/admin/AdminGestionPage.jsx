import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getMatches, postponeMatch, restorePostponedMatch, getPostponedMatches } from '../../services/adminService';
import { supabase, isSupabaseEnabled } from '../../services/supabaseClient';
import styles from './AdminGestion.module.css';

// ─── Onglet Matchs Reportés ────────────────────────────────────────────────────

function PostponedTab() {
  const [allMatches,       setAllMatches]       = useState([]);
  const [postponed,        setPostponed]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [msg,              setMsg]              = useState('');
  const [search,           setSearch]           = useState('');
  // Modal reporter un match
  const [modalMatch,       setModalMatch]       = useState(null);
  const [reason,           setReason]           = useState('');
  const [newDate,          setNewDate]          = useState('');
  const [newTime,          setNewTime]          = useState('');
  const [saving,           setSaving]           = useState(false);
  // Modal restaurer
  const [restoreModal,     setRestoreModal]     = useState(null);
  const [restoreDate,      setRestoreDate]      = useState('');
  const [restoreTime,      setRestoreTime]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, poned] = await Promise.all([getMatches(), getPostponedMatches()]);
      setAllMatches(all.filter(m => m.status !== 'postponed'));
      setPostponed(poned);
    } catch (e) {
      setMsg('⚠️ ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  async function handlePostpone() {
    if (!modalMatch) return;
    setSaving(true);
    try {
      await postponeMatch(modalMatch.id, reason, newDate || null, newTime || null);
      flash('✅ Match reporté.');
      setModalMatch(null);
      setReason(''); setNewDate(''); setNewTime('');
      load();
    } catch (e) {
      flash('⚠️ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore() {
    if (!restoreModal) return;
    setSaving(true);
    try {
      await restorePostponedMatch(restoreModal.id, restoreDate || null, restoreTime || null);
      flash('✅ Match restauré.');
      setRestoreModal(null);
      setRestoreDate(''); setRestoreTime('');
      load();
    } catch (e) {
      flash('⚠️ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const formatDate = (d) => {
    if (!d) return '—';
    const [y, m, day] = String(d).split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('fr-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const filtered = allMatches.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (m.team_a + m.team_b + String(m.journee)).toLowerCase().includes(s);
  });

  return (
    <div>
      {msg && <div className={msg.startsWith('⚠️') ? styles.msgError : styles.msg}>{msg}</div>}

      {/* Matchs actuellement reportés */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          Matchs reportés <span className={styles.count}>{postponed.length}</span>
        </h2>
        {loading ? <p className={styles.info}>Chargement…</p> :
         postponed.length === 0 ? <p className={styles.info}>Aucun match reporté.</p> :
         <div className={styles.cards}>
           {postponed.map(m => (
             <div key={m.id} className={styles.postponedCard}>
               <div className={styles.cardTop}>
                 <span className={styles.journeeBadge}>J{m.journee}</span>
                 <span className={styles.postponedBadge}>📅 Reporté</span>
               </div>
               <div className={styles.teams}>
                 <strong>{m.team_a}</strong>
                 <span className={styles.vs}>vs</span>
                 <strong>{m.team_b}</strong>
               </div>
               {m.postpone_reason && (
                 <p className={styles.reason}>Raison : {m.postpone_reason}</p>
               )}
               <p className={styles.dateLine}>
                 {m.date ? `Nouvelle date : ${formatDate(m.date)} ${m.time ?? ''}` : 'Date à confirmer'}
               </p>
               <button
                 className={styles.restoreBtn}
                 onClick={() => { setRestoreModal(m); setRestoreDate(m.date ?? ''); setRestoreTime(m.time ?? ''); }}
               >
                 ↩ Restaurer / Confirmer date
               </button>
             </div>
           ))}
         </div>
        }
      </section>

      {/* Reporter un match */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Reporter un match</h2>
        <input
          className={styles.searchInput}
          placeholder="Rechercher équipe ou journée…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className={styles.matchList}>
          {filtered.map(m => (
            <div key={m.id} className={styles.matchRow}>
              <span className={styles.journeeBadge}>J{m.journee}</span>
              <span className={styles.matchTeams}>{m.team_a} <span className={styles.vs}>vs</span> {m.team_b}</span>
              <span className={styles.matchDate}>{formatDate(m.date)}</span>
              <button
                className={styles.postponeBtn}
                onClick={() => { setModalMatch(m); setReason(''); setNewDate(''); setNewTime(''); }}
              >
                📅 Reporter
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Modal : reporter */}
      {modalMatch && (
        <div className={styles.overlay} onClick={() => setModalMatch(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Reporter le match</h3>
            <p className={styles.modalSub}>{modalMatch.team_a} vs {modalMatch.team_b} — J{modalMatch.journee}</p>
            <label className={styles.label}>Raison (optionnel)</label>
            <input
              className={styles.input}
              placeholder="ex: Terrain indisponible, météo…"
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
            <label className={styles.label}>Nouvelle date (si connue)</label>
            <input type="date" className={styles.input} value={newDate} onChange={e => setNewDate(e.target.value)} />
            <label className={styles.label}>Nouvelle heure (si connue)</label>
            <input type="time" className={styles.input} value={newTime} onChange={e => setNewTime(e.target.value)} />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setModalMatch(null)}>Annuler</button>
              <button className={styles.confirmBtn} disabled={saving} onClick={handlePostpone}>
                {saving ? '⏳…' : '✅ Confirmer le report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : restaurer */}
      {restoreModal && (
        <div className={styles.overlay} onClick={() => setRestoreModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Confirmer / Restaurer</h3>
            <p className={styles.modalSub}>{restoreModal.team_a} vs {restoreModal.team_b} — J{restoreModal.journee}</p>
            <label className={styles.label}>Date confirmée</label>
            <input type="date" className={styles.input} value={restoreDate} onChange={e => setRestoreDate(e.target.value)} />
            <label className={styles.label}>Heure confirmée</label>
            <input type="time" className={styles.input} value={restoreTime} onChange={e => setRestoreTime(e.target.value)} />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setRestoreModal(null)}>Annuler</button>
              <button className={styles.confirmBtn} disabled={saving} onClick={handleRestore}>
                {saving ? '⏳…' : '↩ Restaurer le match'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Suspensions (placeholder prêt pour la suite) ────────────────────

function SuspensionsTab() {
  return (
    <div className={styles.placeholder}>
      <span className={styles.placeholderIcon}>🚫</span>
      <p className={styles.placeholderTitle}>Gestion des suspensions</p>
      <p className={styles.placeholderText}>
        Cette section sera disponible prochainement.<br />
        Elle permettra de gérer les suspensions automatiques (rouge) et manuelles.
      </p>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AdminGestionPage() {
  const { session, logout } = useAuth();
  const [tab, setTab] = useState('postponed');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>QCN Admin — Gestion</h1>
          <p className={styles.email}>{session?.user?.email}</p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/admin" className={styles.linkBtn}>← Dashboard</Link>
          <button onClick={logout} className={styles.logoutBtn}>Déconnexion</button>
        </div>
      </header>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'postponed' ? styles.tabActive : ''}`}
          onClick={() => setTab('postponed')}
        >
          📅 Matchs reportés
        </button>
        <button
          className={`${styles.tab} ${tab === 'suspensions' ? styles.tabActive : ''}`}
          onClick={() => setTab('suspensions')}
        >
          🚫 Suspensions
        </button>
      </div>

      <div className={styles.content}>
        {tab === 'postponed'   && <PostponedTab />}
        {tab === 'suspensions' && <SuspensionsTab />}
      </div>
    </div>
  );
}
