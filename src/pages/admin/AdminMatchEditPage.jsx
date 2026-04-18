import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getMatchWithEvents, updateScore, addEvent, deleteEvent } from '../../services/adminService';
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
  const navigate = useNavigate();

  const [match,     setMatch]     = useState(null);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [scoreA,    setScoreA]    = useState('');
  const [scoreB,    setScoreB]    = useState('');
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

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const { match: m, events: ev } = await getMatchWithEvents(id);
      setMatch(m);
      setEvents(ev);
      setScoreA(m.score_a ?? '');
      setScoreB(m.score_b ?? '');
      setEvtTeam(m.team_a);
    } catch (e) {
      setError('Impossible de charger ce match : ' + e.message);
    } finally {
      setLoading(false);
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

  const eventsByType = (type) => events.filter(ev => ev.type === type);

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
          {savedMsg && <p className={styles.savedMsg}>{savedMsg}</p>}
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
            <select value={evtTeam} onChange={e => setEvtTeam(e.target.value)} className={styles.select}>
              <option value={match.team_a}>{match.team_a}</option>
              <option value={match.team_b}>{match.team_b}</option>
            </select>
            <input
              type="number" placeholder="N° maillot"
              className={styles.input} style={{ width: '90px' }}
              value={evtPlayerNum} onChange={e => setEvtPlayerNum(e.target.value)}
            />
            <input
              type="text" placeholder="Nom (optionnel)"
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
                value={evtSecNum} onChange={e => setEvtSecNum(e.target.value)} />
              <input type="text" placeholder="Nom (optionnel)" className={styles.input}
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
                return (
                  <div key={ev.id} className={`${styles.eventRow} ${ev._offline ? styles.offline : ''}`}>
                    <span className={styles.evtIcon}>{typeDef?.label.split(' ')[0]}</span>
                    <span className={styles.evtTeam}>{ev.team}</span>
                    <span className={styles.evtPlayer}>
                      {ev.player_num ? `#${ev.player_num}` : ''} {ev.player_name || ''}
                    </span>
                    {ev.minute != null && <span className={styles.evtMin}>{ev.minute}&apos;</span>}
                    {ev._offline && <span className={styles.offlineBadge}>hors ligne</span>}
                    <button onClick={() => handleDeleteEvent(ev.id)} className={styles.deleteBtn}>✕</button>
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
