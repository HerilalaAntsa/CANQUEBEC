/**
 * adminService.js
 * Toutes les opérations DB pour l'interface admin.
 * Offline-first : si Supabase est indisponible, les opérations
 * sont mises en queue dans localStorage et synchronisées au retour.
 */
import { supabase, isSupabaseEnabled } from './supabaseClient';
import { loadHoraireFromUrl } from './excelService';

const OFFLINE_QUEUE_KEY = 'cnq_admin_offline_queue';

export const GSHEET_HORAIRE_URL = 'https://docs.google.com/spreadsheets/d/1Yvz1nlHWeQ9ua4uSh9tD9Aoq83F3h1vGiOMwGdCp5oA/export?format=xlsx';

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

// ─── Matchs reportés ──────────────────────────────────────────────────────────

/** Retourne tous les matchs avec status='postponed' */
export async function getPostponedMatches() {
  if (!isSupabaseEnabled) return [];
  const { data, error } = await supabase
    .from('matches')
    .select('id, journee, team_a, team_b, date, time, venue, status, postpone_reason')
    .eq('status', 'postponed')
    .order('journee', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Marque un match comme reporté avec raison + nouvelle date optionnelle */
export async function postponeMatch(matchId, reason = '', newDate = null, newTime = null) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const fields = { status: 'postponed', postpone_reason: reason };
  if (newDate) fields.date = newDate;
  if (newTime) fields.time = newTime;
  const { error } = await supabase.from('matches').update(fields).eq('id', matchId);
  if (error) throw error;
}

/** Restaure un match reporté → 'upcoming' et mise à jour date/heure */
export async function restorePostponedMatch(matchId, newDate = null, newTime = null) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const fields = { status: 'upcoming', postpone_reason: null };
  if (newDate) fields.date = newDate;
  if (newTime) fields.time = newTime;
  const { error } = await supabase.from('matches').update(fields).eq('id', matchId);
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

/**
 * Charge l'horaire depuis le Google Sheet public, parse les matchs, les importe dans Supabase.
 */
export async function syncFromGoogleSheets() {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const url = GSHEET_HORAIRE_URL + '&t=' + Date.now();
  const data = await loadHoraireFromUrl(url);
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
    if (error) {
      console.error('[importMatches] insert error', error);
      throw new Error(`Insert échoué : ${error.message}${error.details ? ' — ' + error.details : ''}${error.hint ? ' (' + error.hint + ')' : ''}`);
    }
  }

  for (const row of toUpdate) {
    const { id, ...fields } = row;
    const { error } = await supabase.from('matches').update(fields).eq('id', id);
    if (error) {
      console.error('[importMatches] update error', { id, error });
      throw new Error(`Update match #${id} échoué : ${error.message}${error.details ? ' — ' + error.details : ''}`);
    }
  }

  return toInsert.length + toUpdate.length;
}

// ─── Suspensions ──────────────────────────────────────────────────────────────

/** Retourne toutes les suspensions actives (matches_remaining > 0) */
export async function getSuspensions() {
  if (!isSupabaseEnabled) return [];
  const { data, error } = await supabase
    .from('suspensions')
    .select('*')
    .gt('matches_remaining', 0)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Crée une suspension (auto depuis rouge ou manuelle) */
export async function createSuspension({ team, playerNum, playerName, matchesRemaining = 1, reason = 'red_card', type = 'auto', matchId = null }) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('suspensions').insert([{
    team, player_num: playerNum ?? null, player_name: playerName ?? null,
    matches_remaining: matchesRemaining, reason, type, match_id: matchId ?? null,
  }]);
  if (error) throw error;
}

/** Modifie une suspension (nombre de matchs restants, raison) */
export async function updateSuspension(id, { matchesRemaining, reason }) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const fields = {};
  if (matchesRemaining !== undefined) fields.matches_remaining = matchesRemaining;
  if (reason !== undefined) fields.reason = reason;
  const { error } = await supabase.from('suspensions').update(fields).eq('id', id);
  if (error) throw error;
}

/** Lève une suspension (matches_remaining → 0) */
export async function liftSuspension(id) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('suspensions').update({ matches_remaining: 0 }).eq('id', id);
  if (error) throw error;
}

/** Décrémente de 1 le compteur d'une suspension (match purgé) */
export async function decrementSuspension(id) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { data: cur } = await supabase.from('suspensions').select('matches_remaining').eq('id', id).single();
  const next = Math.max(0, (cur?.matches_remaining ?? 1) - 1);
  const { error } = await supabase.from('suspensions').update({ matches_remaining: next }).eq('id', id);
  if (error) throw error;
  return next;
}

/**
 * Crée ou met à jour un override de suspension pour un carton rouge donné (match_id).
 * Si une row existe déjà pour ce match_id → update. Sinon → insert.
 */
export async function setOverrideSuspension({ team, playerNum, playerName, matchId, matchesRemaining, reason = 'red_card' }) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { data: existing } = await supabase
    .from('suspensions')
    .select('id')
    .eq('match_id', matchId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from('suspensions')
      .update({ matches_remaining: matchesRemaining, reason })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('suspensions').insert([{
      team, player_num: playerNum ?? null, player_name: playerName ?? null,
      matches_remaining: matchesRemaining, reason, type: 'auto', match_id: matchId ?? null,
    }]);
    if (error) throw error;
  }
}

// ── Feuille de match ──────────────────────────────────────────

/** Récupère la feuille de match pour un match */
export async function getLineup(matchId) {
  if (!isSupabaseEnabled) return [];
  const { data, error } = await supabase
    .from('match_lineup')
    .select('*')
    .eq('match_id', matchId)
    .order('role')
    .order('player_num');
  if (error) throw error;
  return data ?? [];
}

/** Ajoute un joueur à la feuille de match */
export async function addLineupEntry({ matchId, team, playerNum, playerName, role }) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { data, error } = await supabase
    .from('match_lineup')
    .upsert({
      match_id: Number(matchId),
      team,
      player_num: playerNum ? Number(playerNum) : null,
      player_name: playerName || null,
      role: role || 'starter',
    }, { onConflict: 'match_id,team,player_num' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Supprime une entrée de la feuille de match */
export async function deleteLineupEntry(id) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('match_lineup').delete().eq('id', id);
  if (error) throw error;
}

// ─── Backup / Restore JSON ────────────────────────────────────────────────────

/**
 * Exporte toutes les données Supabase (matches, events, suspensions, lineup)
 * en JSON et déclenche un téléchargement dans le navigateur.
 */
export async function exportBackupJSON() {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');

  const [matchesRes, eventsRes, suspRes, lineupRes] = await Promise.all([
    supabase.from('matches').select('*'),
    supabase.from('match_events').select('*'),
    supabase.from('suspensions').select('*'),
    supabase.from('match_lineup').select('*'),
  ]);

  for (const r of [matchesRes, eventsRes, suspRes, lineupRes]) {
    if (r.error) throw r.error;
  }

  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    matches:     matchesRes.data ?? [],
    match_events: eventsRes.data ?? [],
    suspensions:  suspRes.data ?? [],
    match_lineup: lineupRes.data ?? [],
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qcn_backup_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h')}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Aussi sauvegarder dans localStorage comme cache rapide
  try { localStorage.setItem('qcn_last_backup', json); } catch (_) {}

  return backup;
}

/**
 * Restaure les données depuis un objet backup JSON dans Supabase.
 * N'écrase que les tables présentes dans le backup.
 * NE supprime PAS les données existantes — fait un upsert.
 */
export async function restoreBackupJSON(backup) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  if (!backup?.version) throw new Error('Fichier backup invalide');

  const results = {};

  if (backup.matches?.length) {
    const { error, count } = await supabase.from('matches').upsert(backup.matches, { onConflict: 'id' });
    if (error) throw new Error('matches: ' + error.message);
    results.matches = backup.matches.length;
  }

  if (backup.match_events?.length) {
    const { error } = await supabase.from('match_events').upsert(backup.match_events, { onConflict: 'id' });
    if (error) throw new Error('match_events: ' + error.message);
    results.match_events = backup.match_events.length;
  }

  if (backup.suspensions?.length) {
    const { error } = await supabase.from('suspensions').upsert(backup.suspensions, { onConflict: 'id' });
    if (error) throw new Error('suspensions: ' + error.message);
    results.suspensions = backup.suspensions.length;
  }

  if (backup.match_lineup?.length) {
    const { error } = await supabase.from('match_lineup').upsert(backup.match_lineup, { onConflict: 'id' });
    if (error) throw new Error('match_lineup: ' + error.message);
    results.match_lineup = backup.match_lineup.length;
  }

  return results;
}

// ── Points de pénalité ──────────────────────────────────────────────────────

/** Retourne toutes les pénalités (déductions/bonus de points au classement) */
export async function getPenaltyPoints() {
  if (!isSupabaseEnabled) return [];
  const { data, error } = await supabase
    .from('penalty_points')
    .select('*')
    .order('team', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Ajoute une pénalité/bonus de points */
export async function addPenaltyPoints({ team, points, reason }) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('penalty_points').insert([{ team, points, reason: reason || null }]);
  if (error) throw error;
}

/** Supprime une pénalité par id */
export async function deletePenaltyPoints(id) {
  if (!isSupabaseEnabled) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('penalty_points').delete().eq('id', id);
  if (error) throw error;
}
