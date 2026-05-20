import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useLeagueData } from '../../services/dataStore';
import {
  getMatches, postponeMatch, restorePostponedMatch, getPostponedMatches,
  getSuspensions, createSuspension, updateSuspension, liftSuspension, decrementSuspension,
  setOverrideSuspension,
} from '../../services/adminService';
import { getAllActiveSuspensions } from '../../services/disciplineService';
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

// ─── Onglet Suspensions ───────────────────────────────────────────────────────

const TEAMS = [
  'ALGÉRIE','BURKINA FASO','CAMEROUN','CANADA','CENTRAFRIQUE','CONGO RDC',
  'CÔTE D\'IVOIRE','GABON','GAMBIE','GUINÉE','HAÏTI','MADAGASCAR','MALI',
  'NATIONS UNIES','QUÉBEC','SÉNÉGAL','TANZANIE','TOGO'
];

function SuspensionsTabWrapper() {
  const { players, matches } = useLeagueData();
  return <SuspensionsTab players={players ?? []} allMatches={matches ?? []} />;
}

function SuspensionsTab({ players, allMatches = [] }) {
  const [suspensions,   setSuspensions]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [msg,           setMsg]           = useState('');
  // Modal ajouter
  const [addModal,      setAddModal]      = useState(false);
  const [aTeam,         setATeam]         = useState('');
  const [aNum,          setANum]          = useState('');
  const [aName,         setAName]         = useState('');
  const [aMatches,      setAMatches]      = useState('1');
  const [aReason,       setAReason]       = useState('red_card');
  const [saving,        setSaving]        = useState(false);
  // Modal modifier/lever
  const [editModal,     setEditModal]     = useState(null);
  const [eMatches,      setEMatches]      = useState('1');
  const [eReason,       setEReason]       = useState('');
  // Modal décrémente (purge match)
  const [purgeConfirm,  setPurgeConfirm]  = useState(null);
  // Modal lever (confirmation)
  const [liftConfirm,   setLiftConfirm]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSuspensions(await getAllActiveSuspensions(allMatches)); }
    catch (e) { setMsg('⚠️ ' + e.message); }
    finally { setLoading(false); }
  }, [allMatches]);

  useEffect(() => { load(); }, [load]);
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  async function handleAdd() {
    if (!aTeam) return;
    setSaving(true);
    try {
      await createSuspension({ team: aTeam, playerNum: aNum ? parseInt(aNum) : null,
        playerName: aName || null, matchesRemaining: parseInt(aMatches) || 1,
        reason: aReason, type: 'manual' });
      flash('✅ Suspension ajoutée.');
      setAddModal(false); setATeam(''); setANum(''); setAName(''); setAMatches('1'); setAReason('red_card');
      load();
    } catch (e) { flash('⚠️ ' + e.message); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    if (!editModal) return;
    setSaving(true);
    try {
      await setOverrideSuspension({
        team: editModal.team, playerNum: editModal.playerNum,
        playerName: editModal.playerName, matchId: editModal.matchId,
        matchesRemaining: parseInt(eMatches) || 1, reason: eReason,
      });
      flash('✅ Suspension modifiée.');
      setEditModal(null);
      load();
    } catch (e) { flash('⚠️ ' + e.message); }
    finally { setSaving(false); }
  }

  async function handlePurge(susp) {
    setSaving(true);
    try {
      const next = Math.max(0, susp.remaining - 1);
      await setOverrideSuspension({
        team: susp.team, playerNum: susp.playerNum,
        playerName: susp.playerName, matchId: susp.matchId,
        matchesRemaining: next, reason: 'red_card',
      });
      flash(next === 0 ? '✅ Match purgé — suspension terminée.' : `✅ Match purgé — ${next} match(s) restant(s).`);
      setPurgeConfirm(null);
      load();
    } catch (e) { flash('⚠️ ' + e.message); }
    finally { setSaving(false); }
  }

  async function handleLift(susp) {
    setSaving(true);
    try {
      await setOverrideSuspension({
        team: susp.team, playerNum: susp.playerNum,
        playerName: susp.playerName, matchId: susp.matchId,
        matchesRemaining: 0, reason: 'red_card',
      });
      flash('✅ Suspension levée.');
      setLiftConfirm(null);
      load();
    } catch (e) { flash('⚠️ ' + e.message); }
    finally { setSaving(false); }
  }

  const REASON_LABELS = { red_card: '🟥 Carton rouge', behavior: '⚠️ Comportement', manual: '✏️ Manuelle' };

  return (
    <div>
      {msg && <div className={msg.startsWith('⚠️') ? styles.msgError : styles.msg}>{msg}</div>}

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          Joueurs suspendus <span className={styles.count}>{suspensions.length}</span>
        </h2>
        <button className={styles.addBtn} onClick={() => setAddModal(true)}>+ Ajouter</button>
      </div>

      {loading ? <p className={styles.info}>Chargement…</p> :
       suspensions.length === 0 ? <p className={styles.info}>Aucune suspension active.</p> :
       <div className={styles.cards}>
         {suspensions.map(s => (
           <div key={`${s.team}__${s.playerNum}`} className={styles.suspCard}>
             <div className={styles.cardTop}>
               <span className={styles.suspTeamBadge}>{s.team}</span>
               <span className={styles.suspTypeBadge}>🤖 Auto</span>
             </div>
             <div className={styles.suspPlayer}>
               {s.playerNum && <span className={styles.jersey}>#{s.playerNum}</span>}
               <strong>{s.playerName || 'Joueur inconnu'}</strong>
             </div>
             <div className={styles.suspMeta}>
               <span className={styles.suspReason}>🟥 Carton rouge</span>
               <span className={`${styles.suspCount} ${s.remaining === 1 ? styles.suspCountWarn : ''}`}>
                 🚫 {s.remaining} match{s.remaining > 1 ? 's' : ''} restant{s.remaining > 1 ? 's' : ''}
               </span>
             </div>
             <div className={styles.suspActions}>
               <button className={styles.purgeBtn} onClick={() => setPurgeConfirm(s)}>✓ Purger 1 match</button>
               <button className={styles.editSmBtn} onClick={() => { setEditModal(s); setEMatches(String(s.remaining)); setEReason('red_card'); }}>✏️</button>
               <button className={styles.liftBtn} onClick={() => setLiftConfirm(s)}>🗑 Lever</button>
             </div>
           </div>
         ))}
       </div>
      }

      {/* Modal ajouter */}
      {addModal && (
        <div className={styles.overlay} onClick={() => setAddModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Ajouter une suspension</h3>
            <label className={styles.label}>Équipe *</label>
            <select className={styles.input} value={aTeam} onChange={e => { setATeam(e.target.value); setANum(''); setAName(''); }}>
              <option value="">— Choisir —</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className={styles.label}>Joueur *</label>
            {(() => {
              const teamPlayers = players
                .filter(p => p.team?.trim().toUpperCase() === aTeam?.trim().toUpperCase())
                .sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
              return teamPlayers.length > 0 ? (
                <select className={styles.input} value={aNum} onChange={e => {
                  const p = teamPlayers.find(x => String(x.number) === e.target.value);
                  setANum(e.target.value);
                  setAName(p?.name ?? '');
                }} disabled={!aTeam}>
                  <option value="">— Choisir un joueur —</option>
                  {teamPlayers.map(p => (
                    <option key={p.number} value={String(p.number)}>#{p.number} — {p.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input className={styles.input} type="number" placeholder="N° maillot" value={aNum} onChange={e => setANum(e.target.value)} disabled={!aTeam} />
                  <input className={styles.input} placeholder="Nom complet" value={aName} onChange={e => setAName(e.target.value)} disabled={!aTeam} />
                </>
              );
            })()}
            <label className={styles.label}>Matchs suspendus</label>
            <input className={styles.input} type="number" min="1" max="99" value={aMatches} onChange={e => setAMatches(e.target.value)} />
            <label className={styles.label}>Raison</label>
            <select className={styles.input} value={aReason} onChange={e => setAReason(e.target.value)}>
              <option value="red_card">🟥 Carton rouge</option>
              <option value="behavior">⚠️ Comportement agressif</option>
              <option value="manual">✏️ Décision manuelle</option>
            </select>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setAddModal(false)}>Annuler</button>
              <button className={styles.confirmBtn} disabled={saving || !aTeam} onClick={handleAdd}>
                {saving ? '⏳…' : '✅ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal modifier */}
      {editModal && (
        <div className={styles.overlay} onClick={() => setEditModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Modifier la suspension</h3>
            <p className={styles.modalSub}>{editModal.playerName || `#${editModal.playerNum}`} — {editModal.team}</p>
            <label className={styles.label}>Matchs restants</label>
            <input className={styles.input} type="number" min="0" value={eMatches} onChange={e => setEMatches(e.target.value)} />
            <label className={styles.label}>Raison</label>
            <select className={styles.input} value={eReason} onChange={e => setEReason(e.target.value)}>
              <option value="red_card">🟥 Carton rouge</option>
              <option value="behavior">⚠️ Comportement agressif</option>
              <option value="manual">✏️ Décision manuelle</option>
            </select>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setEditModal(null)}>Annuler</button>
              <button className={styles.confirmBtn} disabled={saving} onClick={handleEdit}>
                {saving ? '⏳…' : '✅ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm purge */}
      {purgeConfirm && (
        <div className={styles.overlay} onClick={() => setPurgeConfirm(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Confirmer la purge</h3>
            <p className={styles.modalSub}>
              {purgeConfirm.playerName || `#${purgeConfirm.playerNum}`} — {purgeConfirm.team}<br />
              Marquer 1 match de suspension purgé ({purgeConfirm.remaining} → {purgeConfirm.remaining - 1}) ?
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setPurgeConfirm(null)}>Annuler</button>
              <button className={styles.confirmBtn} disabled={saving} onClick={() => handlePurge(purgeConfirm)}>
                {saving ? '⏳…' : '✓ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm lift */}
      {liftConfirm && (
        <div className={styles.overlay} onClick={() => setLiftConfirm(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Lever la suspension</h3>
            <p className={styles.modalSub}>
              Lever totalement la suspension de {liftConfirm.playerName || `#${liftConfirm.playerNum}`} ({liftConfirm.team}) ?<br />
              Cette action est irréversible.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setLiftConfirm(null)}>Annuler</button>
              <button className={styles.liftConfirmBtn} disabled={saving} onClick={() => handleLift(liftConfirm)}>
                {saving ? '⏳…' : '🗑 Lever la suspension'}
              </button>
            </div>
          </div>
        </div>
      )}
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
        {tab === 'suspensions' && <SuspensionsTabWrapper />}

      </div>
    </div>
  );
}
