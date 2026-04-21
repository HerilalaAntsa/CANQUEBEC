/**
 * adminService.js
 * Toutes les opérations DB pour l'interface admin.
 * Offline-first : si Supabase est indisponible, les opérations
 * sont mises en queue dans localStorage et synchronisées au retour.
 */
import { supabase, isSupabaseEnabled } from './supabaseClient';

const OFFLINE_QUEUE_KEY = 'cnq_admin_offline_queue';

// ─── Offline queue ────────────────────────────────────────────────────────────

function enqueueOffline(operation) {
  const queue = getOfflineQueue();
  queue.push({ ...operation, ts: Date.now() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearOfflineQueue() {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([]));
}

/** Rejoue toutes les opérations en attente quand la connexion revient */
export async function syncOfflineQueue() {
  if (!isSupabaseEnabled) return { synced: 0, failed: 0 };
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining = [];

  for (const op of queue) {
    try {
      if (op.type === 'updateScore') {
        await _updateScore(op.matchId, op.scoreA, op.scoreB);
        synced++;
      } else if (op.type === 'addEvent') {
        await _addEvent(op.event);
        synced++;
      } else if (op.type === 'deleteEvent') {
        await _deleteEvent(op.eventId);
        synced++;
      }
    } catch {
      remaining.push(op);
      failed++;
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return { synced, failed };
}

// ─── Matches ──────────────────────────────────────────────────────────────────

/** Récupère tous les matchs depuis Supabase, triés par date */
export async function getMatches() {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('date', { ascending: true })
    .order('time', { ascending: true });
  if (error) throw error;
  return data;
}

/** Récupère un match unique avec ses événements */
export async function getMatchWithEvents(matchId) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const [matchRes, eventsRes] = await Promise.all([
    supabase.from('matches').select('*').eq('id', matchId).single(),
    supabase.from('match_events').select('*').eq('match_id', matchId).order('minute', { ascending: true }),
  ]);
  if (matchRes.error) throw matchRes.error;
  return { match: matchRes.data, events: eventsRes.data || [] };
}

/** Met à jour le score d'un match */
async function _updateScore(matchId, scoreA, scoreB) {
  const { error } = await supabase
    .from('matches')
    .update({
      score_a: scoreA,
      score_b: scoreB,
      status: 'played',
    })
    .eq('id', matchId);
  if (error) throw error;
}

export async function updateScore(matchId, scoreA, scoreB) {
  try {
    await _updateScore(matchId, scoreA, scoreB);
  } catch (e) {
    enqueueOffline({ type: 'updateScore', matchId, scoreA, scoreB });
    throw e;
  }
}

// ─── Events (buteurs, passeurs, cartons, remplacements) ───────────────────────

/**
 * event = {
 *   match_id, type, team, player_num, player_name, minute,
 *   secondary_player_num, secondary_player_name  // pour remplacements
 * }
 */
async function _addEvent(event) {
  const { error } = await supabase.from('match_events').insert([event]);
  if (error) throw error;
}

export async function addEvent(event) {
  try {
    await _addEvent(event);
  } catch (e) {
    enqueueOffline({ type: 'addEvent', event });
    throw e;
  }
}

async function _deleteEvent(eventId) {
  const { error } = await supabase.from('match_events').delete().eq('id', eventId);
  if (error) throw error;
}

export async function deleteEvent(eventId) {
  try {
    await _deleteEvent(eventId);
  } catch (e) {
    enqueueOffline({ type: 'deleteEvent', eventId });
    throw e;
  }
}

// ─── Import Excel → Supabase ──────────────────────────────────────────────────

/**
 * Importe les matchs parsés depuis excelService dans Supabase.
 * Utilise upsert sur (journee, team_a, team_b) pour ne pas dupliquer.
 */
export async function importMatchesFromExcel(parsedMatches) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');

  const rows = parsedMatches
    .map((m) => ({
      journee:     m.journee ?? m.Journee ?? m.journée ?? null,
      date:        m.date ? new Date(m.date).toISOString().split('T')[0] : null,
      time:        m.time,
      venue:       m.venue,
      group_name:  m.group,
      team_a:      m.teamA,
      team_b:      m.teamB,
      score_a:     m.scoreA ?? null,
      score_b:     m.scoreB ?? null,
      referee:     m.referee ?? null,
      ref1:        m.ref1 ?? null,
      ref2:        m.ref2 ?? null,
      coordinator: m.coordinator ?? null,
      status:      (m.scoreA !== null && m.scoreB !== null) ? 'played' : 'upcoming',
    }))
    // Exclure les lignes sans journee ou sans équipes (séparateurs, finales sans code)
    .filter((r) => r.journee !== null && r.team_a && r.team_b);

  if (rows.length === 0) throw new Error('Aucun match valide à importer (journee null ou équipes manquantes)');

  const { error } = await supabase
    .from('matches')
    .upsert(rows, { onConflict: 'journee,team_a,team_b' });

  if (error) throw error;
  return rows.length;
}
