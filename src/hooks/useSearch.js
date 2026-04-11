// useSearch.js — Recherche live cross-entités

import { useMemo } from 'react';
import { useLeagueData } from '../services/dataStore';
import { generateSlug } from '../config/teams';

export function useSearch(query) {
  const { teams, players } = useLeagueData();

  return useMemo(() => {
    const q = (query ?? '').trim().toLowerCase();
    if (q.length < 2) return { teams: [], players: [] };

    const matchedTeams = teams.filter(t =>
      t.name.toLowerCase().includes(q)
    ).map(t => ({ ...t, slug: generateSlug(t.name) }));

    const matchedPlayers = players.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.team.toLowerCase().includes(q)
    ).slice(0, 10);

    return { teams: matchedTeams, players: matchedPlayers };
  }, [query, teams, players]);
}
