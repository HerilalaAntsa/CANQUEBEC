/**
 * disciplineService.js
 * Source de vérité unique pour les cartons rouges et suspensions.
 *
 * Règle (art. 8.2 règlement) :
 *   - Carton rouge      → 1 match de suspension minimum
 *   - Comportement agressif → 2 matchs minimum
 *   - Geste violent     → exclusion possible (override admin)
 *
 * Architecture :
 *   - match_events (type='red') = source de vérité des rouges
 *   - suspensions = overrides admin UNIQUEMENT (durée ≠ 1, levée anticipée)
 *   - Le "remaining" est DÉRIVÉ : matchs joués par l'équipe après la journée du rouge
 */

import { supabase, isSupabaseEnabled } from './supabaseClient';

const PLAYED_STATUSES = ['played', 'forfait_a', 'forfait_b'];
const DEFAULT_SUSPENSION_MATCHES = 1; // art. 8.2

/**
 * Calcule la map de suspension pour une équipe donnée.
 *
 * @param {string}   teamName      - Nom normalisé de l'équipe (ex: "CAMEROUN")
 * @param {Array}    teamMatches   - Matchs de l'équipe (depuis le store, avec .journee et .status)
 * @returns {Promise<Object>}      - Map { playerNum: { hasRed, suspended, remaining, playerName } }
 */
export async function getSuspensionMap(teamName, teamMatches = []) {
  if (!isSupabaseEnabled || !teamName) return {};

  const [redRes, overrideRes] = await Promise.all([
    // Tous les rouges de cette équipe, avec la journée du match
    supabase
      .from('match_events')
      .select('player_num, player_name, match_id, matches(journee)')
      .eq('type', 'red')
      .eq('team', teamName),
    // Overrides admin : durée différente de 1, levée anticipée, etc.
    supabase
      .from('suspensions')
      .select('player_num, matches_remaining, match_id')
      .eq('team', teamName),
  ]);

  const reds      = redRes.data      ?? [];
  const overrides = overrideRes.data ?? [];

  // Journées jouées par cette équipe dans l'ordre croissant
  const playedJournees = teamMatches
    .filter(m => PLAYED_STATUSES.includes(m.status) && m.journee != null)
    .map(m => Number(m.journee))
    .sort((a, b) => a - b);

  // Matchs à venir triés par journée (pour calculer la journée de retour)
  const upcomingMatches = teamMatches
    .filter(m => !PLAYED_STATUSES.includes(m.status) && m.journee != null)
    .sort((a, b) => Number(a.journee) - Number(b.journee));

  // matchId → durée de suspension (override admin)
  const overrideByMatch = {};
  for (const o of overrides) {
    if (o.match_id != null) overrideByMatch[o.match_id] = o.matches_remaining;
  }

  const map = {};
  for (const ev of reds) {
    const key        = String(ev.player_num);
    const redJournee = Number(ev.matches?.journee ?? 0);

    // Durée : override admin si défini, sinon règlement art.8.2
    const duration = overrideByMatch[ev.match_id] !== undefined
      ? overrideByMatch[ev.match_id]
      : DEFAULT_SUSPENSION_MATCHES;

    // Matchs joués par l'équipe STRICTEMENT après la journée du rouge
    const playedSince = playedJournees.filter(j => j > redJournee).length;
    const remaining   = Math.max(0, duration - playedSince);

    // Garder le remaining le plus élevé si plusieurs rouges pour le même joueur
    if (!map[key] || remaining > map[key].remaining) {
      // Match de retour = le (remaining)-ème match à venir (après avoir purgé remaining matchs)
      const returnMatch   = remaining > 0 ? (upcomingMatches[remaining] ?? null) : null;
      map[key] = {
        hasRed:        true,
        suspended:     remaining > 0,
        remaining,
        playerName:    ev.player_name ?? null,
        playerNum:     ev.player_num  ?? null,
        returnJournee: returnMatch?.journee ?? null,
        returnDate:    returnMatch?.date    ?? null,
      };
    }
  }

  return map;
}

/**
 * Retourne tous les rouges du tournoi (toutes équipes), avec infos du match.
 * Utilisé par StatsPage onglet Discipline.
 *
 * @returns {Promise<Array>} - Liste des events red avec matches(journee, team_a, team_b)
 */
export async function getAllRedCards() {
  if (!isSupabaseEnabled) return [];
  const { data, error } = await supabase
    .from('match_events')
    .select('id, team, player_name, player_num, minute, match_id, matches(journee, team_a, team_b)')
    .eq('type', 'red')
    .order('match_id', { ascending: true });
  if (error) return [];
  return data ?? [];
}

/**
 * Retourne la liste de tous les joueurs actuellement suspendus (toutes équipes).
 * Nécessite les matchs de chaque équipe pour calculer le remaining.
 *
 * @param {Array} allMatches - Tous les matchs du tournoi (depuis le store)
 * @returns {Promise<Array>} - [{ team, playerNum, playerName, remaining }, ...]
 */
export async function getAllActiveSuspensions(allMatches = []) {
  if (!isSupabaseEnabled) return [];

  const [redRes, overrideRes] = await Promise.all([
    supabase
      .from('match_events')
      .select('player_num, player_name, team, match_id, matches(journee)')
      .eq('type', 'red'),
    supabase
      .from('suspensions')
      .select('player_num, matches_remaining, match_id, team'),
  ]);

  const reds      = redRes.data      ?? [];
  const overrides = overrideRes.data ?? [];

  const overrideByMatch = {};
  for (const o of overrides) {
    if (o.match_id != null) overrideByMatch[o.match_id] = o.matches_remaining;
  }

  // Pré-calculer les journées jouées par équipe
  const journeesByTeam = {};
  for (const m of allMatches) {
    if (!PLAYED_STATUSES.includes(m.status) || m.journee == null) continue;
    const j = Number(m.journee);
    for (const t of [m.teamA, m.teamB]) {
      if (!t) continue;
      if (!journeesByTeam[t]) journeesByTeam[t] = [];
      journeesByTeam[t].push(j);
    }
  }

  const result = [];
  // Dédupe : garder le remaining max par joueur+équipe
  const seen = {};
  for (const ev of reds) {
    const key        = `${ev.team}__${ev.player_num}`;
    const redJournee = Number(ev.matches?.journee ?? 0);
    const teamJournees = (journeesByTeam[ev.team] ?? []).sort((a, b) => a - b);

    const duration    = overrideByMatch[ev.match_id] !== undefined
      ? overrideByMatch[ev.match_id]
      : DEFAULT_SUSPENSION_MATCHES;
    const playedSince = teamJournees.filter(j => j > redJournee).length;
    const remaining   = Math.max(0, duration - playedSince);

    if (remaining > 0 && (!seen[key] || remaining > seen[key])) {
      seen[key] = remaining;
      const idx = result.findIndex(r => r.team === ev.team && String(r.playerNum) === String(ev.player_num));
      const entry = { team: ev.team, playerNum: ev.player_num, playerName: ev.player_name, remaining, matchId: ev.match_id };
      if (idx >= 0) result[idx] = entry;
      else result.push(entry);
    }
  }

  return result.sort((a, b) => b.remaining - a.remaining);
}
