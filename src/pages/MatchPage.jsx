import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';
import { useLeagueData } from '../services/dataStore';
import { canonicalizeTeam } from '../config/teams';
import FlagBadge from '../components/shared/FlagBadge';
import { JerseyBadge, JerseyModal } from '../components/shared/JerseyBadge';
import { getJerseys } from '../config/jerseyConfig';
import styles from './MatchPage.module.css';

const VENUE_LABELS = {
  'VANIER':     '📍 École Vanier',
  'NEUFCHATEL': '📍 École Neufchâtel',
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
  // Forcer interprétation locale (pas UTC) pour éviter le décalage timezone
  const safe = String(dateStr).length === 10 ? dateStr + 'T00:00:00' : dateStr;
  const d = new Date(safe);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('fr-CA', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Mappe un match du store Excel vers le format API Supabase */
function storeMatchToApi(m) {
  return {
    id:          m.supabaseId,
    team_a:      m.teamA,
    team_b:      m.teamB,
    score_a:     m.scoreA,
    score_b:     m.scoreB,
    status:      m.status,
    date:        m.date,
    time:        m.time,
    venue:       m.venue,
    journee:     m.journee,
    group_name:  m.group,
    referee:     m.referee,
    ref1:        m.ref1,
    ref2:        m.ref2,
    coordinator: m.coordinator,
  };
}

export default function MatchPage() {
  const { id } = useParams();
  const { matches: storeMatches, players } = useLeagueData();
  const [match, setMatch] = useState(null);
  const [showJerseyModal, setShowJerseyModal] = useState(false);
  const [events, setEvents] = useState([]);
  const [lineup, setLineup] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchData() {
      // 1. Essayer Supabase d'abord
      if (isSupabaseEnabled) {
        setLoading(true);
        const [matchRes, eventsRes, lineupRes] = await Promise.all([
          supabase.from('matches').select('*').eq('id', id).single(),
          supabase.from('match_events').select('*').eq('match_id', id).order('minute', { ascending: true }),
          supabase.from('match_lineup').select('*').eq('match_id', id).order('player_num', { ascending: true }),
        ]);
        if (!matchRes.error && matchRes.data) {
          setMatch(matchRes.data);
          setEvents(eventsRes.data ?? []);
          setLineup(lineupRes.data ?? []);
          setLoading(false);
          return;
        }
      }

      // 2. Fallback : chercher dans le store local (Excel + scores Supabase mergés)
      const storeMatch = storeMatches.find(m => String(m.supabaseId) === String(id));
      if (storeMatch) {
        setMatch(storeMatchToApi(storeMatch));
        // Les buts issus du store (goals mergés depuis Supabase)
        if (Array.isArray(storeMatch.goals)) {
          setEvents(storeMatch.goals.map((g, i) => ({
            id: i,
            type:        'goal',
            team:        g.team,
            player_name: g.player,
            player_num:  g.num,
            minute:      g.minute ?? null,
            match_id:    id,
          })));
        }
        setLoading(false);
        return;
      }

      setError('Match introuvable');
      setLoading(false);
    }
    fetchData();
  }, [id, storeMatches]);

  if (loading) return <div className={styles.center}>Chargement…</div>;
  if (error)   return <div className={styles.center}>{error}</div>;
  if (!match)  return null;

  const venue   = VENUE_LABELS[match.venue?.trim()] ?? match.venue;
  const played  = ['played', 'forfait_a', 'forfait_b'].includes(match.status);
  const isForfait = match.status === 'forfait_a' || match.status === 'forfait_b';

  // Fallback noms : certains buts ont été saisis sans nom (player_name vide) à cause
  // d'un mismatch d'accents à la saisie (ex. "SENEGAL" vs roster "SÉNÉGAL"). On résout
  // le nom depuis le roster par équipe canonicalisée + numéro. Purement affichage.
  const rosterByKey = new Map();
  for (const p of players ?? []) {
    if (p.number != null) rosterByKey.set(`${canonicalizeTeam(p.team)}:${p.number}`, p.name);
  }
  const rosterName = (team, num) =>
    (num != null && num !== '') ? rosterByKey.get(`${canonicalizeTeam(team)}:${num}`) : undefined;
  const withNames = events.map(ev => ({
    ...ev,
    player_name: ev.player_name || rosterName(ev.team, ev.player_num) || ev.player_name,
    secondary_player_name:
      ev.secondary_player_name || rosterName(ev.team, ev.secondary_player_num) || ev.secondary_player_name,
  }));

  // Trier par minute (null → 1 en premier)
  const sortedEvents = [...withNames].sort((a, b) => (a.minute ?? 1) - (b.minute ?? 1));

  // Normalisation pour éviter les mismatch (espaces, apostrophes typographiques)
  const normTeam = (v) => (v || '').trim().toUpperCase().replace(/\u2019/g, "'");
  const teamAKey = normTeam(match.team_a);
  const teamBKey = normTeam(match.team_b);

  // Séparer les événements/buteurs par équipe
  const eventsA  = sortedEvents.filter(e => normTeam(e.team) === teamAKey);
  const eventsB  = sortedEvents.filter(e => normTeam(e.team) === teamBKey);
  const scorersA = sortedEvents.filter(e => e.type === 'goal' && normTeam(e.team) === teamAKey);
  const scorersB = sortedEvents.filter(e => e.type === 'goal' && normTeam(e.team) === teamBKey);

  const ARB_ROLES = [
    { key: 'referee',     label: 'Arbitre central' },
    { key: 'ref1',        label: 'Arbitre T1' },
    { key: 'ref2',        label: 'Arbitre T2' },
    { key: 'coordinator', label: 'Coordonnateur' },
  ];
  const arbitres = ARB_ROLES.filter(r => match[r.key]);

  const renderEvt = (ev) => {
    const isSub = ev.type === 'sub';
    return (
      <div key={ev.id} className={styles.eventCard}>
        <div className={styles.evtHeader}>
          <span>{EVENT_ICONS[ev.type] ?? '•'}</span>
          <span className={styles.evtHeaderLabel}>{EVENT_LABELS[ev.type] ?? ev.type}</span>
          {ev.minute != null && <span className={styles.evtHeaderMin}>{ev.minute}&apos;</span>}
        </div>
        {isSub ? (
          <div className={styles.evtSubBody}>
            {(ev.player_name || ev.player_num) && (
              <div className={styles.evtSubRow}>
                <span className={styles.evtSubLabelIn}>↑ ENTRÉE</span>
                <div>
                  <div className={styles.evtPlayerName}>{ev.player_name || `#${ev.player_num}`}</div>
                  <div className={styles.evtPlayerMeta}>{ev.team}{ev.player_num ? ` · #${ev.player_num}` : ''}</div>
                </div>
              </div>
            )}
            {(ev.secondary_player_name || ev.secondary_player_num) && (
              <div className={styles.evtSubRow}>
                <span className={styles.evtSubLabelOut}>↓ SORTIE</span>
                <div>
                  <div className={styles.evtPlayerName}>{ev.secondary_player_name || `#${ev.secondary_player_num}`}</div>
                  <div className={styles.evtPlayerMeta}>{ev.team}{ev.secondary_player_num ? ` · #${ev.secondary_player_num}` : ''}</div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.evtBody}>
            <div className={styles.evtAvatar}>{ev.player_num ? `#${ev.player_num}` : '👤'}</div>
            <div className={styles.evtDetails}>
              <span className={styles.evtPlayerName}>{ev.player_name || (ev.player_num ? `#${ev.player_num}` : '?')}</span>
              <span className={styles.evtPlayerMeta}>{ev.team}{ev.player_num ? ` · #${ev.player_num}` : ''}</span>
              {ev.secondary_player_name && (
                <span className={styles.evtPD}>PD · {ev.secondary_player_name}</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <Link to="/qualification" className={styles.back}>← Retour au calendrier</Link>

      {/* En-tête */}
      <div className={styles.header}>
        <div className={styles.metaRow}>
          {match.date && <span>{formatDate(match.date)}</span>}
          {match.time && <><span className={styles.dot}>·</span><span>{match.time}</span></>}
          {venue       && <><span className={styles.dot}>·</span><span className={styles.venue}>{venue}</span></>}
          {match.group_name && <><span className={styles.dot}>·</span><span>Groupe {match.group_name}</span></>}
          {match.journee && <><span className={styles.dot}>·</span><span>Journée {match.journee}</span></>}
        </div>

        {/* Score */}
        <div className={styles.scoreRow}>
          <div className={styles.teamBlock}>
            <FlagBadge team={match.team_a} size="lg" link />
            {match.status === 'forfait_a' && <span className={styles.forfaitLabel}>FORFAIT</span>}
            <JerseyBadge
              colorStr={getJerseys(match.team_a)?.principal}
              onClick={() => setShowJerseyModal(true)}
            />
            {scorersA.length > 0 && (
              <div className={styles.scorersList}>
                {scorersA.map(ev => (
                  <span key={ev.id} className={styles.scorerItem}>
                    <span className={styles.scorerMain}>
                      <span className={styles.scorerIcon}>⚽</span>
                      <span className={styles.scorerName}>{ev.player_name || (ev.player_num ? `#${ev.player_num}` : '?')}</span>
                    </span>
                    {ev.minute ? <span className={styles.scorerMin}>{ev.minute}'</span> : ''}
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
            {played && match.score_a === match.score_b &&
             (match.penalty_a != null || match.penalty_b != null) && (
              <span className={styles.penaltyLine}>
                🎯 Tirs au but {match.penalty_a ?? 0} – {match.penalty_b ?? 0}
              </span>
            )}
            {(match.status === 'forfait_a' || match.status === 'forfait_b') ? (
              <span className={`${styles.statusPill} ${styles.forfait}`}>🚫 Forfait</span>
            ) : (
              <span className={`${styles.statusPill} ${played ? styles.played : styles.upcoming}`}>
                {played ? 'Terminé' : 'À venir'}
              </span>
            )}
          </div>

          <div className={`${styles.teamBlock} ${styles.right}`}>
            <FlagBadge team={match.team_b} size="lg" link />
            {match.status === 'forfait_b' && <span className={styles.forfaitLabel}>FORFAIT</span>}
            <JerseyBadge
              colorStr={getJerseys(match.team_b)?.principal}
              onClick={() => setShowJerseyModal(true)}
            />
            {scorersB.length > 0 && (
              <div className={`${styles.scorersList} ${styles.right}`}>
                {scorersB.map(ev => (
                  <span key={ev.id} className={styles.scorerItem}>
                    <span className={styles.scorerMain}>
                      <span className={styles.scorerIcon}>⚽</span>
                      <span className={styles.scorerName}>{ev.player_name || (ev.player_num ? `#${ev.player_num}` : '?')}</span>
                    </span>
                    {ev.minute ? <span className={styles.scorerMin}>{ev.minute}'</span> : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Événements */}
      {sortedEvents.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Événements du match</h2>
          <div className={styles.eventsGrid}>
            {/* Colonne équipe A */}
            <div className={styles.eventsCol}>
              {eventsA.map(ev => renderEvt(ev))}
            </div>
            {/* Séparateur */}
            <div className={styles.eventsDiv} />
            {/* Colonne équipe B */}
            <div className={styles.eventsCol}>
              {eventsB.map(ev => renderEvt(ev))}
            </div>
          </div>
        </section>
      )}

      {/* Alignement */}
      {lineup.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Alignement</h2>
          <div className={styles.lineupGrid}>
            {[match.team_a, match.team_b].map(team => {
              const starters = lineup.filter(r => r.team === team && r.role === 'starter');
              const subs     = lineup.filter(r => r.team === team && r.role === 'sub');
              const absent   = lineup.filter(r => r.team === team && r.role === 'absent');
              return (
                <div key={team} className={styles.lineupTeamCol}>
                  <div className={styles.lineupTeamHeader}>{team}</div>
                  {starters.length > 0 && (
                    <>
                      <div className={styles.lineupRoleLabel}>🟢 Titulaires</div>
                      {starters.map(p => (
                        <div key={p.id} className={styles.lineupPlayerRow}>
                          {p.player_num ? <span className={styles.lineupJersey}>#{p.player_num}</span> : null}
                          <span>{p.player_name || '—'}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {subs.length > 0 && (
                    <>
                      <div className={styles.lineupRoleLabel}>🔵 Remplaçants</div>
                      {subs.map(p => (
                        <div key={p.id} className={styles.lineupPlayerRow}>
                          {p.player_num ? <span className={styles.lineupJersey}>#{p.player_num}</span> : null}
                          <span>{p.player_name || '—'}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {absent.length > 0 && (
                    <>
                      <div className={styles.lineupRoleLabel}>⚫ Absents</div>
                      {absent.map(p => (
                        <div key={p.id} className={`${styles.lineupPlayerRow} ${styles.lineupAbsent}`}>
                          {p.player_num ? <span className={styles.lineupJersey}>#{p.player_num}</span> : null}
                          <span>{p.player_name || '—'}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
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

      {showJerseyModal && (
        <JerseyModal
          teamA={match.team_a}
          teamB={match.team_b}
          jerseysA={getJerseys(match.team_a)}
          jerseysB={getJerseys(match.team_b)}
          onClose={() => setShowJerseyModal(false)}
        />
      )}
    </div>
  );
}
