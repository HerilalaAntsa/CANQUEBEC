import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';
import FlagBadge from '../components/shared/FlagBadge';
import styles from './MatchPage.module.css';

const VENUE_LABELS = {
  'VANIER':     '📍 Vanier',
  'NEUFCHATEL': '📍 Neufchâtel',
  'CHAUVEAU':   '📍 Chauveau',
};

const EVENT_ICONS = {
  goal:   '⚽',
  assist: '🎯',
  yellow: '🟨',
  red:    '🟥',
  sub:    '🔄',
};
const EVENT_LABELS = {
  goal:   'But',
  assist: 'Passe décisive',
  yellow: 'Carton jaune',
  red:    'Carton rouge',
  sub:    'Remplacement',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('fr-CA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function MatchPage() {
  const { id } = useParams();
  const [match, setMatch] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(!isSupabaseEnabled ? false : true);
  const [error, setError] = useState(isSupabaseEnabled ? null : 'Données live non disponibles');

  useEffect(() => {
    if (!isSupabaseEnabled) return;
    async function fetchData() {
      setLoading(true);
      const [matchRes, eventsRes] = await Promise.all([
        supabase.from('matches').select('*').eq('id', id).single(),
        supabase.from('match_events').select('*').eq('match_id', id).order('minute', { ascending: true }),
      ]);
      if (matchRes.error) { setError('Match introuvable'); setLoading(false); return; }
      setMatch(matchRes.data);
      setEvents(eventsRes.data ?? []);
      setLoading(false);
    }
    fetchData();
  }, [id]);

  if (loading) return <div className={styles.center}>Chargement…</div>;
  if (error)   return <div className={styles.center}>{error}</div>;
  if (!match)  return null;

  const venue   = VENUE_LABELS[match.venue?.trim()] ?? match.venue;
  const played  = match.status === 'played';

  // Séparer les événements par équipe
  const eventsA  = events.filter(e => e.team === match.team_a);
  const eventsB  = events.filter(e => e.team === match.team_b);
  const scorersA = events.filter(e => e.type === 'goal' && e.team === match.team_a);
  const scorersB = events.filter(e => e.type === 'goal' && e.team === match.team_b);

  const ARB_ROLES = [
    { key: 'referee',     label: 'Arbitre central' },
    { key: 'ref1',        label: 'Arbitre T1' },
    { key: 'ref2',        label: 'Arbitre T2' },
    { key: 'coordinator', label: 'Coordonnateur' },
  ];
  const arbitres = ARB_ROLES.filter(r => match[r.key]);

  return (
    <div className={styles.page}>
      <Link to="/qualification" className={styles.back}>← Retour au calendrier</Link>

      {/* En-tête */}
      <div className={styles.header}>
        <div className={styles.metaRow}>
          {match.date && <span>{formatDate(match.date)}</span>}
          {match.time && <><span className={styles.dot}>·</span><span>{match.time}</span></>}
          {venue       && <><span className={styles.dot}>·</span><span>{venue}</span></>}
          {match.group_name && <><span className={styles.dot}>·</span><span>Groupe {match.group_name}</span></>}
          {match.journee && <><span className={styles.dot}>·</span><span>Journée {match.journee}</span></>}
        </div>

        {/* Score */}
        <div className={styles.scoreRow}>
          <div className={styles.teamBlock}>
            <FlagBadge team={match.team_a} size="lg" />
            {scorersA.length > 0 && (
              <div className={styles.scorersList}>
                {scorersA.map(ev => (
                  <span key={ev.id} className={styles.scorerItem}>
                    ⚽ {ev.player_name || (ev.player_num ? `#${ev.player_num}` : '?')}
                    {ev.minute ? <span className={styles.scorerMin}> {ev.minute}'</span> : ''}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.scoreBlock}>
            {played ? (
              <span className={styles.score}>{match.score_a} – {match.score_b}</span>
            ) : (
              <span className={styles.scoreVs}>VS</span>
            )}
            <span className={`${styles.statusPill} ${played ? styles.played : styles.upcoming}`}>
              {played ? 'Terminé' : 'À venir'}
            </span>
          </div>

          <div className={`${styles.teamBlock} ${styles.right}`}>
            <FlagBadge team={match.team_b} size="lg" />
            {scorersB.length > 0 && (
              <div className={`${styles.scorersList} ${styles.right}`}>
                {scorersB.map(ev => (
                  <span key={ev.id} className={styles.scorerItem}>
                    ⚽ {ev.player_name || (ev.player_num ? `#${ev.player_num}` : '?')}
                    {ev.minute ? <span className={styles.scorerMin}> {ev.minute}'</span> : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Événements */}
      {events.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Événements du match</h2>
          <div className={styles.eventsGrid}>
            {/* Colonne équipe A */}
            <div className={styles.eventsCol}>
              {eventsA.map(ev => (
                <div key={ev.id} className={`${styles.eventRow} ${styles.eventLeft}`}>
                  <span className={styles.eventIcon}>{EVENT_ICONS[ev.type] ?? '•'}</span>
                  <div className={styles.eventInfo}>
                    <span className={styles.eventType}>{EVENT_LABELS[ev.type] ?? ev.type}</span>
                    {ev.player_name && <span className={styles.eventPlayer}>{ev.player_name}</span>}
                    {!ev.player_name && ev.player_num && <span className={styles.eventPlayer}>#{ev.player_num}</span>}
                    {ev.type === 'sub' && ev.secondary_player_name && (
                      <span className={styles.eventSub}>↑ {ev.secondary_player_name}</span>
                    )}
                  </div>
                  {ev.minute && <span className={styles.eventMin}>{ev.minute}'</span>}
                </div>
              ))}
            </div>

            {/* Séparateur */}
            <div className={styles.eventsDiv} />

            {/* Colonne équipe B */}
            <div className={styles.eventsCol}>
              {eventsB.map(ev => (
                <div key={ev.id} className={`${styles.eventRow} ${styles.eventRight}`}>
                  {ev.minute && <span className={styles.eventMin}>{ev.minute}'</span>}
                  <div className={styles.eventInfo}>
                    <span className={styles.eventType}>{EVENT_LABELS[ev.type] ?? ev.type}</span>
                    {ev.player_name && <span className={styles.eventPlayer}>{ev.player_name}</span>}
                    {!ev.player_name && ev.player_num && <span className={styles.eventPlayer}>#{ev.player_num}</span>}
                    {ev.type === 'sub' && ev.secondary_player_name && (
                      <span className={styles.eventSub}>↑ {ev.secondary_player_name}</span>
                    )}
                  </div>
                  <span className={styles.eventIcon}>{EVENT_ICONS[ev.type] ?? '•'}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Arbitres */}
      {arbitres.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Officiels</h2>
          <div className={styles.arbGrid}>
            {arbitres.map(r => (
              <div key={r.key} className={styles.arbCard}>
                <span className={styles.arbRole}>{r.label}</span>
                <span className={styles.arbName}>{match[r.key]}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
