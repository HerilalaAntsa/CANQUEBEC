// useTeam.js — Données d'une équipe spécifique par slug

import { useMemo } from 'react';
import { useLeagueData } from '../services/dataStore';
import { generateSlug, normalizeTeamName } from '../config/teams';

export function useTeam(slug) {
  const { teams, matches, standings, liveStandings, players, scorers, assisters, teamMeta, bannedPlayers } = useLeagueData();

  const mergedStandings = useMemo(() => {
    // Si liveStandings disponibles (Supabase), ils ont priorité
    // Sinon, on garde les standings statiques de l'Excel
    if (liveStandings && liveStandings.length > 0) {
      const base = {};
      for (const s of standings) base[s.team] = { ...s };
      for (const s of liveStandings) {
        if (base[s.team]) base[s.team] = { ...base[s.team], ...s };
        else base[s.team] = s;
      }
      return Object.values(base);
    }
    return standings;
  }, [standings, liveStandings]);

  return useMemo(() => {
    if (!slug || !teams.length) return null;

    // Retrouver l'équipe par slug
    const team = teams.find(t => generateSlug(t.name) === slug);
    if (!team) return null;

    const name = normalizeTeamName(team.name);

    const teamMatches = matches.filter(
      m => normalizeTeamName(m.teamA) === name || normalizeTeamName(m.teamB) === name
    );

    const standing = mergedStandings.find(s => normalizeTeamName(s.team) === name) ?? null;

    // Calculer buts/passes depuis les events des matchs mergés (Supabase > Excel)
    const goalsByPlayer  = {}; // { playerNum: count }
    const assistsByPlayer = {};
    for (const m of teamMatches) {
      if (!Array.isArray(m.goals)) continue;
      for (const g of m.goals) {
        if (normalizeTeamName(g.team) !== name) continue;
        const num = String(g.player_num ?? g.num ?? '');
        if (!num) continue;
        if (g.type === 'goal' || g.type == null) {
          goalsByPlayer[num] = (goalsByPlayer[num] ?? 0) + 1;
        }
        if (g.type === 'assist') {
          assistsByPlayer[num] = (assistsByPlayer[num] ?? 0) + 1;
        }
      }
    }

    const roster = players
      .filter(p => normalizeTeamName(p.team) === name && !p.banned)
      .map(p => {
        const num = String(p.number ?? '');
        const liveGoals   = goalsByPlayer[num];
        const liveAssists = assistsByPlayer[num];
        return {
          ...p,
          goals:   liveGoals   !== undefined ? liveGoals   : (p.goals   ?? 0),
          assists: liveAssists !== undefined ? liveAssists : (p.assists ?? 0),
        };
      })
      .sort((a, b) => a.number - b.number);

    // ── Joueurs bannis (Excel + Supabase permanents) ────────────────
    // 1. Bannis détectés dans l'Excel (banned: true)
    const excelBanned = players.filter(p => normalizeTeamName(p.team) === name && p.banned);
    // 2. Bannis stockés dans Supabase mais absent de l'Excel actuel (supprimés par erreur)
    const excelBannedNames = new Set(excelBanned.map(p => p.name?.toLowerCase().trim()));
    const supabaseBanned = (bannedPlayers ?? [])
      .filter(p => normalizeTeamName(p.team) === name)
      .filter(p => !excelBannedNames.has(p.name?.toLowerCase().trim()));
    // 3. Fusion + conflit de numéro : si le numéro d'un banni = numéro d'un actif → null
    const activeNumbers = new Set(roster.map(p => p.number).filter(Boolean));
    const bannedRoster = [...excelBanned, ...supabaseBanned]
      .map(p => ({
        ...p,
        number:  (p.number && activeNumbers.has(p.number)) ? null : p.number,
        goals:   0,
        assists: 0,
      }))
      .sort((a, b) => {
        if (a.number === null && b.number !== null) return 1;
        if (b.number === null && a.number !== null) return -1;
        return (a.number ?? 0) - (b.number ?? 0);
      });

    const topScorers = scorers
      .filter(s => normalizeTeamName(s.team) === name)
      .map(s => {
        const num = String(s.playerNumber ?? '');
        const liveGoals = goalsByPlayer[num];
        return liveGoals !== undefined ? { ...s, goals: liveGoals } : s;
      })
      .sort((a, b) => b.goals - a.goals);

    const topAssisters = assisters
      .filter(a => normalizeTeamName(a.team) === name)
      .sort((a, b) => b.assists - a.assists);

    const meta = teamMeta.find(m => normalizeTeamName(m.name) === name) ?? null;

    return { team, name, standing, teamMatches, roster, bannedRoster, topScorers, topAssisters, meta };
  }, [slug, teams, matches, mergedStandings, players, scorers, assisters, teamMeta, bannedPlayers]);
}
