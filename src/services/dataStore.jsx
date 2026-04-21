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

// ─────────────────────────────────────────────
// ÉTAT INITIAL
// ─────────────────────────────────────────────

const initialState = {
  // Données
  matches:       [],
  teams:         [],
  standings:     [],
  scorers:       [],
  assisters:     [],
  players:       [],
  teamMeta:      [],   // métadonnées équipes (coach, capitaine, email...)

  // Scores live depuis Supabase (clé: `${journee}:${teamA}:${teamB}`)
  supabaseScores: {},

  // État de chargement
  loading:        false,
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
      return {
        ...state,
        loading:    false,
        error:      null,
        matches:    applySupabaseScores(data.matches, state.supabaseScores),
        teams:      data.teams,
        standings:  data.standings,
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
      const scores = action.scores; // { [key]: { scoreA, scoreB, status } }
      return {
        ...state,
        loadingScores:  false,
        supabaseScores: scores,
        matches:        applySupabaseScores(state.matches, scores),
      };
    }

    case 'SUPABASE_SCORES_ERROR':
      return { ...state, loadingScores: false };

    default:
      return state;
  }
}

/**
 * Applique les scores Supabase sur les matchs Excel.
 * Clé de matching : journee + teamA + teamB
 */
function applySupabaseScores(matches, supabaseScores) {
  if (!supabaseScores || Object.keys(supabaseScores).length === 0) return matches;
  return matches.map((m) => {
    const key = `${m.journee}:${m.teamA}:${m.teamB}`;
    const live = supabaseScores[key];
    if (!live) return m;
    return {
      ...m,
      supabaseId: live.id,
      scoreA:     live.scoreA ?? m.scoreA,
      scoreB:     live.scoreB ?? m.scoreB,
      status:     live.status,
      goals:      live.goals ?? [],
    };
  });
}

/**
 * Fusionne deux sources de joueurs — la liste "listes" a priorité sur "horaire"
 * Clé de déduplication : number + team
 */
function mergePlayerSources(primary, secondary) {
  const map = new Map();
  // D'abord la source secondaire (moins prioritaire)
  for (const p of secondary) {
    map.set(`${p.number}:${p.team}`, p);
  }
  // Puis la source primaire (écrase)
  for (const p of primary) {
    map.set(`${p.number}:${p.team}`, { ...map.get(`${p.number}:${p.team}`), ...p });
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
      const [matchesRes, eventsRes] = await Promise.all([
        supabase.from('matches').select('id, journee, team_a, team_b, score_a, score_b, status'),
        supabase.from('match_events').select('match_id, type, team, player_name, player_num, minute').eq('type', 'goal'),
      ]);
      if (matchesRes.error) throw matchesRes.error;

      // Regrouper les buts par match_id
      const goalsByMatch = {};
      for (const ev of eventsRes.data ?? []) {
        if (!goalsByMatch[ev.match_id]) goalsByMatch[ev.match_id] = [];
        goalsByMatch[ev.match_id].push(ev);
      }

      const scores = {};
      for (const row of matchesRes.data ?? []) {
        const key = `${row.journee}:${row.team_a}:${row.team_b}`;
        scores[key] = {
          id:     row.id,
          scoreA: row.score_a,
          scoreB: row.score_b,
          status: row.status,
          goals:  goalsByMatch[row.id] ?? [],
        };
      }
      dispatch({ type: 'SUPABASE_SCORES_LOADED', scores });
      log.info('SUPABASE_SCORES_LOADED', { count: matchesRes.data?.length });
    } catch (err) {
      log.warn('SUPABASE_SCORES_ERROR', { error: err.message });
      dispatch({ type: 'SUPABASE_SCORES_ERROR' });
    }
  }, []);

  // ── Charge le fichier horaire depuis URL
  const loadHoraire = useCallback(async (url) => {
    dispatch({ type: 'HORAIRE_LOAD_START' });
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
      dispatch({ type: 'HORAIRE_LOAD_ERROR', error: err.message });
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

export function useLeagueData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useLeagueData must be used within DataProvider');
  return ctx;
}
