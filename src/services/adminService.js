/**
 * adminService.js
 * Toutes les opérations DB pour l'interface admin.
 * Offline-first : si Supabase est indisponible, les opérations
 * sont mises en queue dans localStorage et synchronisées au retour.
 */
import { supabase, isSupabaseEnabled } from './supabaseClient';
import { loadHoraireFromUrl } from './excelService';

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
    .update({ score_a: scoreA, score_b: scoreB })
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

/** Change le statut d'un match : 'upcoming' | 'live' | 'played' */
export async function setMatchStatus(matchId, status) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { error } = await supabase
    .from('matches')
    .update({ status })
    .eq('id', matchId);
  if (error) throw error;
}

export async function updateMatchDateTime(matchId, date, time) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const fields = {};
  if (date) fields.date = date;
  if (time) fields.time = time;
  const { error } = await supabase
    .from('matches')
    .update(fields)
    .eq('id', matchId);
  if (error) throw error;
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

/** Met à jour un événement existant */
export async function updateEvent(eventId, fields) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { error } = await supabase
    .from('match_events')
    .update(fields)
    .eq('id', eventId);
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

// ─── Sync depuis Google Sheets ───────────────────────────────────────────────

const GSHEET_ID = '1Yvz1nlHWeQ9ua4uSh9tD9Aoq83F3h1vGiOMwGdCp5oA';
const GSHEET_EXPORT_URL = `https://docs.google.com/spreadsheets/d/${GSHEET_ID}/export?format=xlsx`;

/**
 * Télécharge le Google Sheet en XLSX, parse les matchs, les importe dans Supabase.
 * Retourne le nombre de matchs importés.
 */
export async function syncFromGoogleSheets() {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const data = await loadHoraireFromUrl(GSHEET_EXPORT_URL);
  const count = await importMatchesFromExcel(data.matches);
  return { count, teams: data.teams.length };
}

// ─── Import Excel → Supabase ──────────────────────────────────────────────────

/**
 * Importe les matchs parsés depuis excelService dans Supabase.
 * Utilise upsert sur (journee, team_a, team_b) pour ne pas dupliquer.
 */
export async function importMatchesFromExcel(parsedMatches) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');

  const allRows = parsedMatches
    .map((m) => ({
      journee:     m.journee ?? null,
      phase:       m.phase   ?? null,
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
    .filter((r) => r.team_a && r.team_b && r.team_a !== 'À déterminer');

  if (allRows.length === 0) throw new Error('Aucun match valide à importer');

  const groupRows  = allRows.filter(r => r.journee !== null);

  // Dédupliquer les finaleRows (même phase+teamA+teamB possible dans l'Excel)
  const _finaleRaw = allRows.filter(r => r.journee === null && r.phase !== null);
  const _seenPhase = new Set();
  const finaleRows = _finaleRaw.filter(r => {
    const k = `${r.phase}:${r.team_a}:${r.team_b}`;
    if (_seenPhase.has(k)) return false;
    _seenPhase.add(k);
    return true;
  });

  // Fetch tous les matchs existants pour faire un upsert manuel (évite les problèmes d'index partiels)
  const { data: existing, error: fetchErr } = await supabase
    .from('matches')
    .select('id, journee, phase, team_a, team_b, score_a, score_b, status');
  if (fetchErr) throw fetchErr;

  const byJourneeKey = {};
  const byPhaseKey = {};
  for (const row of existing ?? []) {
    if (row.journee !== null) byJourneeKey[`${row.journee}:${row.team_a}:${row.team_b}`] = row;
    else if (row.phase)       byPhaseKey[`${row.phase}:${row.team_a}:${row.team_b}`]     = row;
  }

  const toInsert = [];
  const toUpdate = [];

  for (const row of groupRows) {
    const key = `${row.journee}:${row.team_a}:${row.team_b}`;
    const ex  = byJourneeKey[key];
    if (ex) {
      // Préserver les scores/statut déjà saisis via admin
      toUpdate.push({ id: ex.id, ...row, score_a: ex.score_a, score_b: ex.score_b, status: ex.status });
    } else {
      toInsert.push(row);
    }
  }

  for (const row of finaleRows) {
    const key = `${row.phase}:${row.team_a}:${row.team_b}`;
    const ex  = byPhaseKey[key];
    if (ex) {
      toUpdate.push({ id: ex.id, ...row, score_a: ex.score_a, score_b: ex.score_b, status: ex.status });
    } else {
      toInsert.push(row);
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('matches').insert(toInsert);
    if (error) throw error;
  }

  for (const row of toUpdate) {
    const { id, ...fields } = row;
    const { error } = await supabase.from('matches').update(fields).eq('id', id);
    if (error) throw error;
  }

  return toInsert.length + toUpdate.length;
}
