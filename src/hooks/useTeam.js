// useTeam.js — Données d'une équipe spécifique par slug

import { useMemo } from 'react';
import { useLeagueData } from '../services/dataStore';
import { generateSlug, normalizeTeamName } from '../config/teams';

export function useTeam(slug) {
  const { teams, matches, standings, players, scorers, assisters, teamMeta } = useLeagueData();

  return useMemo(() => {
    if (!slug || !teams.length) return null;

    // Retrouver l'équipe par slug
    const team = teams.find(t => generateSlug(t.name) === slug);
    if (!team) return null;

    const name = normalizeTeamName(team.name);

    const teamMatches = matches.filter(
      m => normalizeTeamName(m.teamA) === name || normalizeTeamName(m.teamB) === name
    );

    const standing = standings.find(s => normalizeTeamName(s.team) === name) ?? null;

    const roster = players
      .filter(p => normalizeTeamName(p.team) === name)
      .sort((a, b) => a.number - b.number);

    const topScorers = scorers
      .filter(s => normalizeTeamName(s.team) === name)
      .sort((a, b) => b.goals - a.goals);

    const topAssisters = assisters
      .filter(a => normalizeTeamName(a.team) === name)
      .sort((a, b) => b.assists - a.assists);

    const meta = teamMeta.find(m => normalizeTeamName(m.name) === name) ?? null;

    return { team, name, standing, teamMatches, roster, topScorers, topAssisters, meta };
  }, [slug, teams, matches, standings, players, scorers, assisters, teamMeta]);
}
