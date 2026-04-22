import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMatchWithEvents, updateScore, addEvent, deleteEvent, updateEvent, setMatchStatus, updateMatchDateTime } from '../../services/adminService';
import { useLeagueData } from '../../services/dataStore';
import styles from './AdminMatchEdit.module.css';

const EVENT_TYPES = [
  { value: 'goal',    label: '⚽ But' },
  { value: 'assist',  label: '🎯 Passe décisive' },
  { value: 'yellow',  label: '🟨 Carton jaune' },
  { value: 'red',     label: '🟥 Carton rouge' },
  { value: 'sub',     label: '🔄 Remplacement' },
];

export default function AdminMatchEditPage() {
  const { id } = useParams();
  const { players } = useLeagueData();

  const [match,     setMatch]     = useState(null);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [postponeMode, setPostponeMode] = useState(false);
  const [postponeDate, setPostponeDate] = useState('');
  const [postponeTime, setPostponeTime] = useState('');
  const [scoreA,    setScoreA]    = useState('0');
  const [scoreB,    setScoreB]    = useState('0');
  const [savedMsg,  setSavedMsg]  = useState('');

  // New event form
  const [evtType,       setEvtType]       = useState('goal');
  const [evtTeam,       setEvtTeam]       = useState('');
  const [evtPlayerNum,  setEvtPlayerNum]  = useState('');
  const [evtPlayerName, setEvtPlayerName] = useState('');
  const [evtMinute,     setEvtMinute]     = useState('');
  const [evtSecNum,     setEvtSecNum]     = useState(''); // remplacement sortant
  const [evtSecName,    setEvtSecName]    = useState('');
  const [addingEvt,     setAddingEvt]     = useState(false);
  const [editingEvt,    setEditingEvt]    = useState(null); // { id, player_num, player_name, minute }
  const [savingEvt,     setSavingEvt]     = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { match: m, events: ev } = await getMatchWithEvents(id);
      setMatch(m);
      setEvents(ev);
      setScoreA(m.score_a ?? 0);
      setScoreB(m.score_b ?? 0);
      setEvtTeam(m.team_a);
    } catch (e) {
      setError('Impossible de charger ce match : ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleStatus(newStatus) {
    setStatusBusy(true);
    try {
      await setMatchStatus(id, newStatus);
      // Si on démarre le match et que le score est encore null → forcer 0-0
      if (newStatus === 'live' && (match.score_a === null || match.score_b === null)) {
        await updateScore(id, 0, 0);
        setScoreA('0');
        setScoreB('0');
        setMatch(prev => ({ ...prev, score_a: 0, score_b: 0 }));
      }
      setMatch(prev => ({ ...prev, status: newStatus }));
      setSavedMsg(
        newStatus === 'live'   ? '🔴 Match démarré' :
        newStatus === 'played' ? '✅ Match terminé' : 'Statut mis à jour'
      );
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) {
      setSavedMsg('⚠️ Erreur : ' + e.message);
      setTimeout(() => setSavedMsg(''), 4000);
    } finally {
      setStatusBusy(false);
    }
  }

  async function handlePostpone(e) {
    e.preventDefault();
    setStatusBusy(true);
    try {
      await setMatchStatus(id, 'postponed');
      if (postponeDate || postponeTime) {
        await updateMatchDateTime(id, postponeDate || undefined, postponeTime || undefined);
      }
      setMatch(prev => ({
        ...prev,
        status: 'postponed',
        ...(postponeDate ? { date: postponeDate } : {}),
        ...(postponeTime ? { time: postponeTime } : {}),
      }));
      setPostponeMode(false);
      setSavedMsg('⚠️ Match reporté');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      setSavedMsg('⚠️ Erreur : ' + err.message);
      setTimeout(() => setSavedMsg(''), 4000);
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleSaveScore(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateScore(id, Number(scoreA), Number(scoreB));
      setSavedMsg('Score sauvegardé ✅');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch {
      setSavedMsg('⚠️ Sauvegardé hors ligne — sera synchronisé au retour');
      setTimeout(() => setSavedMsg(''), 5000);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    setAddingEvt(true);
    const event = {
      match_id:              Number(id),
      type:                  evtType,
      team:                  evtTeam,
      player_num:            evtPlayerNum ? Number(evtPlayerNum) : null,
      player_name:           evtPlayerName || null,
      minute:                evtMinute ? Number(evtMinute) : null,
      secondary_player_num:  evtSecNum ? Number(evtSecNum) : null,
      secondary_player_name: evtSecName || null,
    };
    try {
      await addEvent(event);
      setEvents(prev => [...prev, { ...event, id: Date.now() }]);
      setEvtPlayerNum(''); setEvtPlayerName(''); setEvtMinute('');
      setEvtSecNum(''); setEvtSecName('');
    } catch {
      // enqueued offline — still show optimistically
      setEvents(prev => [...prev, { ...event, id: Date.now(), _offline: true }]);
    } finally {
      setAddingEvt(false);
    }
  }

  async function handleDeleteEvent(evtId) {
    if (!confirm('Supprimer cet événement ?')) return;
    try {
      await deleteEvent(evtId);
    } catch { /* queued offline */ }
    setEvents(prev => prev.filter(ev => ev.id !== evtId));
  }

  function handleStartEdit(ev) {
    setEditingEvt({
      id:          ev.id,
      player_num:  ev.player_num  ?? '',
      player_name: ev.player_name ?? '',
      minute:      ev.minute      ?? '',
    });
  }

  async function handleSaveEdit() {
    if (!editingEvt) return;
    setSavingEvt(true);
    try {
      const fields = {
        player_num:  editingEvt.player_num  ? Number(editingEvt.player_num)  : null,
        player_name: editingEvt.player_name || null,
        minute:      editingEvt.minute      ? Number(editingEvt.minute)      : null,
      };
      await updateEvent(editingEvt.id, fields);
      setEvents(prev => prev.map(ev =>
        ev.id === editingEvt.id ? { ...ev, ...fields } : ev
      ));
      setEditingEvt(null);
    } catch (e) {
      alert('Erreur : ' + e.message);
    } finally {
      setSavingEvt(false);
    }
  }

  /** Cherche un joueur par numéro + équipe dans la liste Excel */
  const lookupPlayer = useCallback((num, team) => {
    if (!num || !team || !players?.length) return null;
    return players.find(p =>
      String(p.number) === String(num) &&
      p.team?.toLowerCase().trim() === team?.toLowerCase().trim()
    ) ?? null;
  }, [players]);

  function handlePlayerNumChange(num) {
    setEvtPlayerNum(num);
    const found = lookupPlayer(num, evtTeam);
    if (found) setEvtPlayerName(found.name ?? '');
  }

  function handleSecNumChange(num) {
    setEvtSecNum(num);
    const found = lookupPlayer(num, evtTeam);
    if (found) setEvtSecName(found.name ?? '');
  }

  if (loading) return <div className={styles.loading}>Chargement...</div>;
  if (error)   return <div className={styles.error}>{error}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/admin" className={styles.back}>← Tableau de bord</Link>
        <span className={styles.matchTitle}>
          {match.team_a} vs {match.team_b}
          <span className={styles.metaBadge}>J{match.journee} · {match.venue}</span>
        </span>
      </div>

      {/* Statut du match */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Statut du match</h2>
        <div className={styles.statusRow}>
          <span className={`${styles.statusBadge} ${styles[`status_${match.status}`]}`}>
            {match.status === 'live'      ? '🔴 En cours'  :
             match.status === 'played'   ? '✅ Terminé'    :
             match.status === 'postponed'? '⚠️ Reporté'   : '⏳ À venir'}
          </span>
          {(match.status === 'upcoming' || match.status === 'postponed') && (
            <button className={styles.liveBtn} disabled={statusBusy} onClick={() => handleStatus('live')}>
              ▶ Démarrer le match
            </button>
          )}
          {match.status === 'live' && (
            <button className={styles.endBtn} disabled={statusBusy} onClick={() => handleStatus('played')}>
              ✅ Terminer le match
            </button>
          )}
          {match.status === 'played' && (
            <button className={styles.reopenBtn} disabled={statusBusy} onClick={() => handleStatus('live')}>
              🔄 Rouvrir
            </button>
          )}
          {match.status !== 'postponed' && match.status !== 'played' && (
            <button
              className={styles.postponeBtn}
              disabled={statusBusy}
              onClick={() => setPostponeMode(v => !v)}
            >
              🗓 Reporter
            </button>
          )}
          {match.status === 'postponed' && (
            <button
              className={styles.postponeBtn}
              disabled={statusBusy}
              onClick={() => setPostponeMode(v => !v)}
            >
              ✏️ Modifier la date
            </button>
          )}
        </div>

        {postponeMode && (
          <form onSubmit={handlePostpone} className={styles.postponeForm}>
            <p className={styles.postponeHint}>Nouvelle date (optionnel — peut être fixée plus tard)</p>
            <div className={styles.postponeFields}>
              <input
                type="date"
                className={styles.postponeInput}
                value={postponeDate}
                onChange={e => setPostponeDate(e.target.value)}
              />
              <input
                type="time"
                className={styles.postponeInput}
                value={postponeTime}
                onChange={e => setPostponeTime(e.target.value)}
              />
            </div>
            <div className={styles.postponeBtns}>
              <button type="submit" className={styles.postponeConfirm} disabled={statusBusy}>
                {statusBusy ? '...' : (match.status === 'postponed' ? 'Mettre à jour' : 'Confirmer le report')}
              </button>
              <button type="button" className={styles.postponeCancel} onClick={() => setPostponeMode(false)}>
                Annuler
              </button>
            </div>
          </form>
        )}

        {savedMsg && <p className={styles.savedMsg}>{savedMsg}</p>}
      </section>

      {/* Score */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Score</h2>
        <form onSubmit={handleSaveScore} className={styles.scoreForm}>
          <div className={styles.scoreRow}>
            <span className={styles.teamLabel}>{match.team_a}</span>
            <input
              type="number" min="0" max="99"
              className={styles.scoreInput}
              value={scoreA}
              onChange={e => setScoreA(e.target.value)}
            />
            <span className={styles.dash}>—</span>
            <input
              type="number" min="0" max="99"
              className={styles.scoreInput}
              value={scoreB}
              onChange={e => setScoreB(e.target.value)}
            />
            <span className={styles.teamLabel}>{match.team_b}</span>
          </div>
          <button type="submit" className={styles.saveBtn} disabled={saving}>
            {saving ? 'Sauvegarde...' : 'Enregistrer le score'}
          </button>
        </form>
      </section>

      {/* Add event */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Ajouter un événement</h2>
        <form onSubmit={handleAddEvent} className={styles.evtForm}>
          <div className={styles.evtRow}>
            <select value={evtType} onChange={e => setEvtType(e.target.value)} className={styles.select}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={evtTeam} onChange={e => {
                setEvtTeam(e.target.value);
                if (evtPlayerNum) {
                  const found = lookupPlayer(evtPlayerNum, e.target.value);
                  if (found) setEvtPlayerName(found.name ?? '');
                }
              }} className={styles.select}>
              <option value={match.team_a}>{match.team_a}</option>
              <option value={match.team_b}>{match.team_b}</option>
            </select>
            <input
              type="number" placeholder="N° maillot"
              className={styles.input} style={{ width: '90px' }}
              value={evtPlayerNum} onChange={e => handlePlayerNumChange(e.target.value)}
            />
            <input
              type="text" placeholder="Nom (auto ou manuel)"
              className={styles.input}
              value={evtPlayerName} onChange={e => setEvtPlayerName(e.target.value)}
            />
            <input
              type="number" placeholder="Min." min="0" max="120"
              className={styles.input} style={{ width: '70px' }}
              value={evtMinute} onChange={e => setEvtMinute(e.target.value)}
            />
          </div>
          {evtType === 'sub' && (
            <div className={styles.evtRow}>
              <span className={styles.subLabel}>Joueur sortant :</span>
              <input type="number" placeholder="N° maillot" className={styles.input} style={{ width: '90px' }}
                value={evtSecNum} onChange={e => handleSecNumChange(e.target.value)} />
              <input type="text" placeholder="Nom (auto ou manuel)" className={styles.input}
                value={evtSecName} onChange={e => setEvtSecName(e.target.value)} />
            </div>
          )}
          <button type="submit" className={styles.addBtn} disabled={addingEvt}>
            {addingEvt ? 'Ajout...' : '+ Ajouter'}
          </button>
        </form>
      </section>

      {/* Events list */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Événements ({events.length})</h2>
        {events.length === 0
          ? <p className={styles.empty}>Aucun événement enregistré.</p>
          : (
            <div className={styles.eventList}>
              {events.map(ev => {
                const typeDef = EVENT_TYPES.find(t => t.value === ev.type);
                const isEditing = editingEvt?.id === ev.id;
                return (
                  <div key={ev.id} className={`${styles.eventRow} ${ev._offline ? styles.offline : ''} ${isEditing ? styles.editingRow : ''}`}>
                    <span className={styles.evtIcon}>{typeDef?.label.split(' ')[0]}</span>
                    <span className={styles.evtTeam}>{ev.team}</span>

                    {isEditing ? (
                      <>
                        <input
                          type="number" placeholder="N°" className={styles.editInput}
                          style={{ width: '60px' }}
                          value={editingEvt.player_num}
                          onChange={e => setEditingEvt(prev => ({ ...prev, player_num: e.target.value }))}
                        />
                        <input
                          type="text" placeholder="Nom" className={styles.editInput}
                          value={editingEvt.player_name}
                          onChange={e => setEditingEvt(prev => ({ ...prev, player_name: e.target.value }))}
                        />
                        <input
                          type="number" placeholder="Min." className={styles.editInput}
                          style={{ width: '55px' }}
                          value={editingEvt.minute}
                          onChange={e => setEditingEvt(prev => ({ ...prev, minute: e.target.value }))}
                        />
                        <button onClick={handleSaveEdit} disabled={savingEvt} className={styles.saveEditBtn}>
                          {savingEvt ? '…' : '✓'}
                        </button>
                        <button onClick={() => setEditingEvt(null)} className={styles.cancelEditBtn}>✕</button>
                      </>
                    ) : (
                      <>
                        <span className={styles.evtPlayer}>
                          {ev.player_num ? `#${ev.player_num}` : ''} {ev.player_name || ''}
                        </span>
                        {ev.minute != null && <span className={styles.evtMin}>{ev.minute}&apos;</span>}
                        {ev._offline && <span className={styles.offlineBadge}>hors ligne</span>}
                        <button onClick={() => handleStartEdit(ev)} className={styles.editBtn}>✏️</button>
                        <button onClick={() => handleDeleteEvent(ev.id)} className={styles.deleteBtn}>✕</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )
        }
      </section>
    </div>
  );
}
