// dataStore.js — LNQ 2026
// Context + Reducer centralisant tout l'état de l'application

import { createContext, useContext, useReducer, useCallback } from 'react';
import {
  loadHoraireFromUrl,
  loadHoraireFromFile,
  tryLoadPlayersFromUrl,
  tryLoadPlayersFromFile,
  resolvePlayerNames,
} from './excelService';
import { supabase, isSupabaseEnabled } from './supabaseClient';
import { log } from './logger';
import { canonicalizeTeam } from '../config/teams';

// ─────────────────────────────────────────────
// ÉTAT INITIAL
// ─────────────────────────────────────────────

const initialState = {
  // Données
  matches:       [],
  teams:         [],
  standings:     [],   // standings statiques depuis Excel
  liveStandings: [],   // standings calculés depuis Supabase (prioritaires)
  scorers:       [],
  assisters:     [],
  players:       [],
  teamMeta:      [],   // métadonnées équipes (coach, capitaine, email...)

  // Scores live depuis Supabase (clé: `${journee}:${teamA}:${teamB}`)
  supabaseScores: {},
  penaltyPoints:  [],   // [{ team, points, reason }] déductions/bonus au classement
  bannedPlayers:  [],   // [{ team, number, name, reason, notes }] bannis permanents (Supabase)

  // État de chargement
  loading:        true,   // true par défaut pour éviter le flash "introuvable" au refresh
  loadingPlayers: false,
  loadingScores:  false,
  error:          null,

  // Info sur les fichiers chargés
  fileInfo: {
    horaire:  null,   // { name, loadedAt }
    players:  null,
  },
};

// ─────────────────────────────────────────────
// REDUCER
// ─────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {

    case 'HORAIRE_LOAD_START':
      return { ...state, loading: true, error: null };

    case 'HORAIRE_LOAD_SUCCESS': {
      const { data, fileInfo } = action;
      // Merge joueurs horaire + joueurs déjà chargés
      const mergedPlayers = mergePlayerSources(data.players ?? [], state.players);
      const { scorers, assisters, players } = resolvePlayerNames(
        data.rawScorers,
        data.rawAssisters,
        mergedPlayers
      );
      const matchesWithSupa = injectSupabaseOnlyMatches(
        applySupabaseScores(data.matches, state.supabaseScores),
        state.supabaseScores
      );
      return {
        ...state,
        loading:    false,
        error:      null,
        matches:    matchesWithSupa,
        teams:      data.teams,
        standings:  data.standings,
        liveStandings: computeLiveStandings(data.matches, state.supabaseScores, state.penaltyPoints),
        scorers,
        assisters,
        players,
        fileInfo:   { ...state.fileInfo, horaire: fileInfo },
      };
    }

    case 'HORAIRE_LOAD_ERROR':
      return { ...state, loading: false, error: action.error };

    case 'PLAYERS_LOAD_START':
      return { ...state, loadingPlayers: true };

    case 'PLAYERS_LOAD_SUCCESS': {
      const { playersData, fileInfo } = action;
      const allPlayers = playersData.flatMap(d => d.players ?? []);
      const allTeamMeta = playersData.flatMap(d => d.teamMeta ?? []);

      const mergedPlayers = mergePlayerSources(allPlayers, state.players);
      const { scorers, assisters, players } = resolvePlayerNames(
        state.scorers.map(s => ({ ...s, playerName: undefined, hasFullData: undefined })),
        state.assisters.map(a => ({ ...a, playerName: undefined, hasFullData: undefined })),
        mergedPlayers
      );

      // Re-résoudre depuis les rawScorers/rawAssisters stockés dans state
      return {
        ...state,
        loadingPlayers: false,
        players,
        scorers,
        assisters,
        teamMeta: allTeamMeta,
        fileInfo: { ...state.fileInfo, players: fileInfo },
      };
    }

    case 'PLAYERS_LOAD_DONE':
      return { ...state, loadingPlayers: false };

    case 'SUPABASE_SCORES_START':
      return { ...state, loadingScores: true };

    case 'SUPABASE_SCORES_LOADED': {
      const scores = action.scores; // { [key]: { id, scoreA, scoreB, status, goals } }
      const penalties = action.penalties ?? state.penaltyPoints;
      const bannedPlayers = action.bannedPlayers ?? state.bannedPlayers;
      const mergedMatches = injectSupabaseOnlyMatches(
        applySupabaseScores(state.matches, scores),
        scores
      );
      return {
        ...state,
        loadingScores:  false,
        supabaseScores: scores,
        penaltyPoints:  penalties,
        bannedPlayers,
        matches:        mergedMatches,
        liveStandings:  computeLiveStandings(state.matches, scores, penalties),
      };
    }

    case 'SUPABASE_SCORES_ERROR':
      return { ...state, loadingScores: false };

    default:
      return state;
  }
}

/**
 * Calcule le classement live depuis les scores Supabase.
 * Victoire = +3, Nul = +1 chaque, Défaite = 0
 * penalties = [{ team, points }] → déductions/bonus
 */
function computeLiveStandings(matches, supabaseScores, penalties = []) {
  if (!supabaseScores || Object.keys(supabaseScores).length === 0) return [];

  const table = {}; // { teamName: { played, won, drawn, lost, goalsFor, goalsAgainst, points } }

  const ensure = (name) => {
    if (!table[name]) table[name] = { team: name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
  };

  for (const [key, row] of Object.entries(supabaseScores)) {
    // Ignorer les clés fallback "teams:tA:tB" pour ne pas compter chaque match en double
    if (key.startsWith('teams:')) continue;
    const isForfait = row.status === 'forfait_a' || row.status === 'forfait_b';
    if (row.status !== 'played' && row.status !== 'live' && !isForfait) continue;

    const a = row.teamA;
    const b = row.teamB;
    if (!a || !b) continue;

    ensure(a); ensure(b);
    table[a].played++;
    table[b].played++;

    if (row.scoreA === null || row.scoreB === null) continue;
    table[a].goalsFor     += row.scoreA;
    table[a].goalsAgainst += row.scoreB;
    table[b].goalsFor     += row.scoreB;
    table[b].goalsAgainst += row.scoreA;

    if (isForfait) {
      // Forfait A → B gagne 3-0 ; Forfait B → A gagne 3-0
      if (row.status === 'forfait_a') {
        table[b].won++; table[b].points += 3;
        table[a].lost++;
      } else {
        table[a].won++; table[a].points += 3;
        table[b].lost++;
      }
    } else if (row.scoreA > row.scoreB) {
      table[a].won++; table[a].points += 3;
      table[b].lost++;
    } else if (row.scoreA < row.scoreB) {
      table[b].won++; table[b].points += 3;
      table[a].lost++;
    } else {
      table[a].drawn++; table[a].points += 1;
      table[b].drawn++; table[b].points += 1;
    }
  }

  // Appliquer les déductions/bonus de points
  for (const p of penalties) {
    if (table[p.team]) table[p.team].points += p.points;
  }

  return Object.values(table).map(r => ({
    ...r,
    goalDiff: r.goalsFor - r.goalsAgainst,
  }));
}

/**
 * Applique les scores Supabase sur les matchs Excel.
 * Clé de matching : journee + teamA + teamB
 */
function applySupabaseScores(matches, supabaseScores) {
  if (!supabaseScores || Object.keys(supabaseScores).length === 0) return matches;
  const norm = s => (s || '').trim().toUpperCase().replace(/\u2019/g, "'");

  // Compter les occurrences d'une même paire d'équipes dans l'horaire (phase groupes)
  // Si une paire apparaît plusieurs fois, on n'utilise PAS le fallback teams:*
  // pour éviter d'appliquer un même match Supabase sur plusieurs lignes Excel.
  const pairCounts = new Map();
  for (const m of matches) {
    if (m.phase) continue;
    const pairKey = `teams:${norm(m.teamA)}:${norm(m.teamB)}`;
    pairCounts.set(pairKey, (pairCounts.get(pairKey) ?? 0) + 1);
  }

  const merged = matches.map((m) => {
    // Phase finale → clé "phase:X:teamA:teamB", groupes → "journee:teamA:teamB"
    const key = m.phase
      ? `phase:${m.phase}:${norm(m.teamA)}:${norm(m.teamB)}`
      : `${m.journee}:${norm(m.teamA)}:${norm(m.teamB)}`;
    const fallbackKey = `teams:${norm(m.teamA)}:${norm(m.teamB)}`;
    const canUseFallback = !m.phase && (pairCounts.get(fallbackKey) ?? 0) === 1; // jamais pour la phase finale
    const live = supabaseScores[key] ?? (canUseFallback ? supabaseScores[fallbackKey] : undefined);
    if (!live) return m;
    return {
      ...m,
      supabaseId: live.id,
      scoreA:     live.scoreA ?? m.scoreA,
      scoreB:     live.scoreB ?? m.scoreB,
      penaltyA:   live.penaltyA ?? m.penaltyA ?? null,
      penaltyB:   live.penaltyB ?? m.penaltyB ?? null,
      status:     live.status,
      goals:      live.goals    ?? [],
      redCards:   live.redCards ?? [],
      date:       live.date        ?? m.date,
      time:       live.time        ?? m.time,
      venue:      live.venue       ?? m.venue,
      referee:    live.referee     ?? m.referee,
      ref1:       live.ref1        ?? m.ref1,
      ref2:       live.ref2        ?? m.ref2,
      coordinator: live.coordinator ?? m.coordinator,
    };
  });

  // Dédupliquer les doublons de l'horaire (mêmes équipes/date/heure)
  // en gardant la version la plus fiable (score/statut/buteurs Supabase).
  const statusRank = (s) => {
    if (s === 'played' || s === 'forfait_a' || s === 'forfait_b') return 3;
    if (s === 'live') return 2;
    if (s === 'postponed') return 1;
    return 0; // upcoming / inconnu
  };
  const qualityRank = (m) => {
    const hasScore = Number.isFinite(m?.scoreA) && Number.isFinite(m?.scoreB) ? 1 : 0;
    const hasSupa  = m?.supabaseId ? 1 : 0;
    const goalsLen = Array.isArray(m?.goals) ? m.goals.length : 0;
    return hasSupa * 100 + statusRank(m?.status) * 10 + hasScore * 5 + Math.min(goalsLen, 4);
  };

  const byKey = new Map();
  for (const m of merged) {
    const dedupeKey = `m:${m.phase ? `phase:${m.phase}` : 'groups'}:${norm(m.teamA)}:${norm(m.teamB)}:${m.date ?? ''}:${m.time ?? ''}`;
    const prev = byKey.get(dedupeKey);
    if (!prev || qualityRank(m) > qualityRank(prev)) {
      byKey.set(dedupeKey, m);
    }
  }

  return [...byKey.values()];
}

/**
 * Injecte les matchs Supabase qui n'ont pas d'équivalent dans l'Excel (ex: phase finale saisie directement en admin).
 * Ces matchs existent dans supabaseScores mais ne correspondent à aucun match Excel.
 * Supprime aussi les placeholders "À déterminer" de l'Excel pour les phases couvertes par Supabase.
 */
function injectSupabaseOnlyMatches(matches, supabaseScores) {
  const norm = s => (s || '').trim().toUpperCase().replace(/\u2019/g, "'");
  const isPlaceholder = (m) =>
    !m.teamA || !m.teamB ||
    m.teamA === 'À déterminer' || m.teamB === 'À déterminer' ||
    m.teamA === 'À DÉTERMINER' || m.teamB === 'À DÉTERMINER';

  // Collecter les phases réelles dans Supabase
  const supabasePhases = new Set();
  const supabaseMatches = [];
  for (const [key, entry] of Object.entries(supabaseScores)) {
    if (!key.startsWith('phase:')) continue;
    if (key.startsWith('teams:')) continue;
    if (!entry.teamA || !entry.teamB) continue;
    const parts = key.split(':');
    // key = "phase:PHASE_NAME:TEAM_A:TEAM_B"
    const phase = parts.slice(1, parts.length - 2).join(':');
    supabasePhases.add(phase);
    supabaseMatches.push({ key, entry, phase });
  }

  // Trouver les clés déjà couvertes par l'Excel (matchs avec vrais noms)
  const existingKeys = new Set();
  for (const m of matches) {
    if (!m.phase || isPlaceholder(m)) continue;
    existingKeys.add(`phase:${m.phase}:${norm(m.teamA)}:${norm(m.teamB)}`);
    existingKeys.add(`phase:${m.phase}:${norm(m.teamB)}:${norm(m.teamA)}`);
  }

  // Filtrer les matches Excel : supprimer les placeholders des phases couvertes par Supabase
  const filtered = matches.filter(m => {
    if (!m.phase) return true;  // garder tous les matchs de groupe
    if (!isPlaceholder(m)) return true;  // garder les vrais matchs
    return !supabasePhases.has(m.phase);  // supprimer placeholder si Supabase couvre cette phase
  });

  // Ajouter les matchs Supabase absents de l'Excel
  const extra = [];
  for (const { key, entry, phase } of supabaseMatches) {
    if (existingKeys.has(key)) continue;
    extra.push({
      id:          entry.id,
      supabaseId:  entry.id,
      journee:     null,
      phase,
      teamA:       entry.teamA,
      teamB:       entry.teamB,
      scoreA:      entry.scoreA ?? null,
      scoreB:      entry.scoreB ?? null,
      penaltyA:    entry.penaltyA ?? null,
      penaltyB:    entry.penaltyB ?? null,
      status:      entry.status ?? 'upcoming',
      date:        entry.date   ?? null,
      time:        entry.time   ?? null,
      venue:       entry.venue  ?? null,
      goals:       entry.goals  ?? [],
      redCards:    entry.redCards ?? [],
      referee:     entry.referee  ?? null,
      ref1:        entry.ref1     ?? null,
      ref2:        entry.ref2     ?? null,
      coordinator: entry.coordinator ?? null,
    });
  }
  return [...filtered, ...extra];
}

/**
 * Fusionne deux sources de joueurs — la liste "listes" a priorité sur "horaire"
 * Clé de déduplication :
 *  - Joueur actif  → "number:team" (un seul par numéro/équipe)
 *  - Joueur banni  → "banned:name:team" (clé par nom pour éviter collision si numéro réattribué)
 */
function mergePlayerSources(primary, secondary) {
  const map = new Map();
  const playerKey = (p) => p.banned
    ? `banned:${(p.name || '').toLowerCase().trim()}:${p.team}`
    : `${p.number}:${p.team}`;
  // D'abord la source secondaire (moins prioritaire)
  for (const p of secondary) {
    map.set(playerKey(p), p);
  }
  // Puis la source primaire (écrase — mais bannis gardent leur propre clé)
  for (const p of primary) {
    const key = playerKey(p);
    map.set(key, { ...map.get(key), ...p });
  }
  return [...map.values()];
}

// ─────────────────────────────────────────────
// CONTEXT + PROVIDER
// ─────────────────────────────────────────────

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Charge les scores live depuis Supabase
  const loadSupabaseScores = useCallback(async () => {
    if (!isSupabaseEnabled) return;
    dispatch({ type: 'SUPABASE_SCORES_START' });
    try {
      const [matchesRes, eventsRes, redEventsRes, penaltyRes, bannedRes] = await Promise.all([
        supabase.from('matches').select('id, journee, phase, team_a, team_b, score_a, score_b, penalty_a, penalty_b, status, date, time, venue, referee, ref1, ref2, coordinator'),
        supabase.from('match_events').select('match_id, type, team, player_name, player_num, minute').eq('type', 'goal'),
        supabase.from('match_events').select('match_id, type, team, player_name, player_num, minute').eq('type', 'red'),
        supabase.from('penalty_points').select('team, points').then(r => r),
        supabase.from('banned_players').select('team, player_num, player_name, reason, notes'),
      ]);
      if (matchesRes.error) throw matchesRes.error;
      const penaltyData  = penaltyRes.error  ? [] : (penaltyRes.data ?? []);
      const bannedData   = bannedRes.error   ? [] : (bannedRes.data ?? []).map(r => ({
        team:        r.team,
        number:      r.player_num ?? null,
        name:        r.player_name,
        reason:      r.reason ?? 'excel',
        notes:       r.notes ?? null,
        banned:      true,
        goals:       0,
        assists:     0,
        hasFullData: true,
      }));

      // Regrouper les buts par match_id.
      // On CANONICALISE l'équipe du but : sinon un but saisi "SENEGAL" (sans accent)
      // ne correspond pas au match affiché "SÉNÉGAL" et le buteur disparaît des cartes.
      const goalsByMatch = {};
      for (const ev of eventsRes.data ?? []) {
        if (!goalsByMatch[ev.match_id]) goalsByMatch[ev.match_id] = [];
        goalsByMatch[ev.match_id].push({ ...ev, team: canonicalizeTeam(ev.team) });
      }

      // Regrouper les cartons rouges par match_id (même canonicalisation)
      const redsByMatch = {};
      for (const ev of redEventsRes.data ?? []) {
        if (!redsByMatch[ev.match_id]) redsByMatch[ev.match_id] = [];
        redsByMatch[ev.match_id].push({ ...ev, team: canonicalizeTeam(ev.team) });
      }

      const scores = {};
      for (const row of matchesRes.data ?? []) {
        // Normaliser + corriger accents (saisies manuelles sans accent dans Supabase)
        const tA = canonicalizeTeam(row.team_a);
        const tB = canonicalizeTeam(row.team_b);
        // Clé principale : journee:teamA:teamB
        // Clé secondaire (fallback si journee erronée) : teamA:teamB seul
        const key = row.phase
          ? `phase:${row.phase}:${tA}:${tB}`
          : `${row.journee}:${tA}:${tB}`;
        const fallbackKey = `teams:${tA}:${tB}`;
        const entry = {
          id:          row.id,
          teamA:       tA,
          teamB:       tB,
          scoreA:      row.score_a,
          scoreB:      row.score_b,
          penaltyA:    row.penalty_a ?? null,
          penaltyB:    row.penalty_b ?? null,
          status:      row.status,
          date:        row.date        ?? null,
          time:        row.time        ?? null,
          venue:       row.venue       ?? null,
          goals:       goalsByMatch[row.id] ?? [],
          redCards:    redsByMatch[row.id]   ?? [],
          referee:     row.referee     ?? null,
          ref1:        row.ref1        ?? null,
          ref2:        row.ref2        ?? null,
          coordinator: row.coordinator ?? null,
        };
        // En cas de doublon (même clé), préférer l'entrée avec le plus de données (arbitres, score, etc.)
        const richness = e => (e.referee ? 1 : 0) + (e.scoreA != null ? 1 : 0) + (e.goals?.length ?? 0);
        if (!scores[key] || richness(entry) > richness(scores[key])) {
          scores[key] = entry;
        }
        // Fallback : si journée erronée dans Supabase, permettre merge par équipes seules
        // (n'écrase pas si une vraie clé journée existe déjà)
        if (!scores[fallbackKey]) scores[fallbackKey] = entry;
      }
      dispatch({ type: 'SUPABASE_SCORES_LOADED', scores, penalties: penaltyData, bannedPlayers: bannedData });
      log.info('SUPABASE_SCORES_LOADED', { count: matchesRes.data?.length });
    } catch (err) {
      log.warn('SUPABASE_SCORES_ERROR', { error: err.message });
      dispatch({ type: 'SUPABASE_SCORES_ERROR' });
    }
  }, []);

  // ── Charge le fichier horaire depuis URL
  const loadHoraire = useCallback(async (url, { silent = false } = {}) => {
    if (!silent) dispatch({ type: 'HORAIRE_LOAD_START' });
    try {
      const data = await loadHoraireFromUrl(url);
      dispatch({
        type:     'HORAIRE_LOAD_SUCCESS',
        data,
        fileInfo: { name: url.split('/').pop(), loadedAt: new Date() },
      });
      // Charge les scores Supabase en parallèle
      loadSupabaseScores();
    } catch (err) {
      if (!silent) dispatch({ type: 'HORAIRE_LOAD_ERROR', error: err.message });
      throw err; // re-throw pour que le .catch() dans App.jsx fonctionne
    }
  }, [loadSupabaseScores]);

  // ── Charge le fichier horaire depuis un File (upload)
  const loadHoraireFile = useCallback(async (file) => {
    dispatch({ type: 'HORAIRE_LOAD_START' });
    try {
      const data = await loadHoraireFromFile(file);
      dispatch({
        type:     'HORAIRE_LOAD_SUCCESS',
        data,
        fileInfo: { name: file.name, loadedAt: new Date() },
      });
      // Charge les scores Supabase en parallèle
      loadSupabaseScores();
    } catch (err) {
      dispatch({ type: 'HORAIRE_LOAD_ERROR', error: err.message });
    }
  }, [loadSupabaseScores]);

  // ── Charge les fichiers listes joueurs (A et B) depuis URLs — ne rejette pas
  const loadPlayers = useCallback(async (urlA, urlB) => {
    dispatch({ type: 'PLAYERS_LOAD_START' });
    try {
      const results = await Promise.all([
        tryLoadPlayersFromUrl(urlA),
        tryLoadPlayersFromUrl(urlB),
      ]);
      dispatch({
        type:        'PLAYERS_LOAD_SUCCESS',
        playersData: results,
        fileInfo:    { names: [urlA, urlB].map(u => u.split('/').pop()), loadedAt: new Date() },
      });
      // Sync joueurs bannis vers Supabase (fire & forget)
      // Permet de les retrouver même si l'Excel est modifié plus tard
      if (isSupabaseEnabled) {
        const allParsed = results.flatMap(d => d.players ?? []);
        const banned = allParsed.filter(p => p.banned);
        if (banned.length > 0) {
          supabase.from('banned_players').upsert(
            banned.map(p => ({
              team:        p.team,
              player_num:  p.number ?? null,
              player_name: p.name,
              reason:      'excel',
            })),
            { onConflict: 'team,player_name', ignoreDuplicates: true }
          ).then(({ error }) => { if (error) console.warn('[banned sync]', error.message); });
        }
      }
    } catch (err) {
      log.warn('PLAYERS_LOAD_UNEXPECTED', { error: err.message });
      dispatch({ type: 'PLAYERS_LOAD_DONE' });
    }
  }, []);

  // ── Charge fichiers joueurs depuis File objects (upload)
  const loadPlayersFiles = useCallback(async (fileA, fileB) => {
    dispatch({ type: 'PLAYERS_LOAD_START' });
    const results = await Promise.all([
      fileA ? tryLoadPlayersFromFile(fileA) : Promise.resolve([]),
      fileB ? tryLoadPlayersFromFile(fileB) : Promise.resolve([]),
    ]);
    dispatch({
      type:        'PLAYERS_LOAD_SUCCESS',
      playersData: results,
      fileInfo:    { names: [fileA?.name, fileB?.name].filter(Boolean), loadedAt: new Date() },
    });
  }, []);

  const value = {
    ...state,
    loadHoraire,
    loadHoraireFile,
    loadPlayers,
    loadPlayersFiles,
    loadSupabaseScores,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

// ─────────────────────────────────────────────
// HOOKS D'ACCÈS
// ─────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useLeagueData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useLeagueData must be used within DataProvider');
  return ctx;
}
