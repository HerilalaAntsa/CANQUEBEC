// excelService.js — LNQ 2026
// Parse les 3 fichiers Excel et retourne les données normalisées

import * as XLSX from 'xlsx';
import { log } from './logger';
import { normalizeTeamName, SHEET_TO_TEAM, POSITION_LABELS } from '../config/teams';

// ─────────────────────────────────────────────
// POINT D'ENTRÉE PUBLIC
// ─────────────────────────────────────────────

/**
 * Charge et parse le fichier horaire principal depuis une URL
 */
export async function loadHoraireFromUrl(url) {
  const corrId = log.corrId();
  log.info('HORAIRE_LOAD_START', { corrId, url });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    const buffer = await res.arrayBuffer();
    const data = parseHoraire(buffer);
    log.info('HORAIRE_LOAD_SUCCESS', { corrId, matches: data.matches.length, teams: data.teams.length });
    return data;
  } catch (err) {
    log.error('HORAIRE_LOAD_ERROR', { corrId, error: err.message });
    throw err;
  }
}

/**
 * Charge et parse le fichier horaire depuis un File object (upload manuel)
 */
export function loadHoraireFromFile(file) {
  const corrId = log.corrId();
  log.info('HORAIRE_LOAD_START', { corrId, file: file.name });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = parseHoraire(e.target.result);
        log.info('HORAIRE_LOAD_SUCCESS', { corrId, matches: data.matches.length });
        resolve(data);
      } catch (err) {
        log.error('HORAIRE_PARSE_ERROR', { corrId, error: err.message });
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Tente de charger un fichier listes joueurs — ne rejette JAMAIS
 * Retourne [] si absent ou illisible
 */
export async function tryLoadPlayersFromUrl(url) {
  const corrId = log.corrId();
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warn('PLAYERS_FILE_ABSENT', { corrId, url, status: res.status });
      return [];
    }
    const buffer = await res.arrayBuffer();
    const players = parsePlayersFile(buffer, corrId);
    log.info('PLAYERS_LOAD_SUCCESS', { corrId, url, count: players.length });
    return players;
  } catch (err) {
    log.warn('PLAYERS_FILE_UNAVAILABLE', { corrId, url, error: err.message });
    return [];
  }
}

/**
 * Tente de charger un fichier listes joueurs depuis un File (upload)
 */
export function tryLoadPlayersFromFile(file) {
  const corrId = log.corrId();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const players = parsePlayersFile(e.target.result, corrId);
        resolve(players);
      } catch (err) {
        log.warn('PLAYERS_PARSE_ERROR', { corrId, error: err.message });
        resolve([]);
      }
    };
    reader.onerror = () => resolve([]);
    reader.readAsArrayBuffer(file);
  });
}

// ─────────────────────────────────────────────
// PARSERS INTERNES
// ─────────────────────────────────────────────

function parseHoraire(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  const players = parseJoueursSheet(wb.Sheets['JOUEURS']);

  // Lire feuille principale + éventuelle copie (ex: "Copie de MATCHS")
  const matchesMain = parseMatches(wb.Sheets['MATCHS']);
  const matchesCopy = parseMatches(wb.Sheets['Copie de MATCHS']);

  // Fusionner : prendre les matchs de la copie qui n'existent pas dans la principale
  const seenKey = (m) => {
    if (m.journee !== null && m.journee !== undefined) {
      return `g:${m.journee}:${(m.teamA||'').toUpperCase().trim()}:${(m.teamB||'').toUpperCase().trim()}`;
    }
    return `p:${m.phase||''}:${(m.teamA||'').toUpperCase().trim()}:${(m.teamB||'').toUpperCase().trim()}`;
  };
  const seen = new Set(matchesMain.map(seenKey));
  const extra = matchesCopy.filter(m => !seen.has(seenKey(m)));
  const matches = [...matchesMain, ...extra];

  const teams     = parseTeams(wb.Sheets['EQUIPES']);
  const standings = parseStandings(wb.Sheets['CLASSEMENT']);
  const rawScorers   = parseRawScorers(wb.Sheets['CLASSEMENT_BUTEURS']);
  const rawAssisters = parseRawAssisters(wb.Sheets['CLASSEMENT_PASSEURS']);

  return { matches, teams, standings, rawScorers, rawAssisters, players };
}

// ─── MATCHS ───────────────────────────────────

// Noms de mois français → index 0-11 pour new Date(2026, idx, day)
const MONTHS_FR = {
  janvier: 0, 'février': 1, fevrier: 1, mars: 2, avril: 3,
  mai: 4, juin: 5, juillet: 6, 'août': 7, aout: 7,
  septembre: 8, octobre: 9, novembre: 10, 'décembre': 11, decembre: 11,
};

function parseStringDate(str) {
  if (!str) return null;
  const s = str.toString().toLowerCase().trim();
  for (const [month, idx] of Object.entries(MONTHS_FR)) {
    if (s.includes(month)) {
      const dayMatch = s.match(/\d+/);
      if (dayMatch) return new Date(2026, idx, parseInt(dayMatch[0]));
    }
  }
  return null;
}

function normalizeRound(raw) {
  const s = raw.toLowerCase().trim();
  if (s.includes('1/8'))     return '1/8e de finale';
  if (s.includes('1/4'))     return 'Quarts de finale';
  if (s.includes('1/2'))     return 'Demi-finales';
  if (s.includes('final'))   return 'Finale';
  if (s.includes('barrage')) return 'Barrages';
  return raw.trim();
}

const ROUND_KEYWORDS = ['1/8', '1/4', '1/2', 'finale', 'barrage'];

function parseMatches(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const matches = [];
  let currentJournee = 0;
  let inPhaseFinale   = false;
  let currentRound    = '';

  // Auto-détecter l'offset de colonnes :
  // Fichier local : a une colonne "G" (groupe) en position 4 → offset = 1
  //   row[4]=G, row[5]=ÉquipeA, row[6]=vs, row[7]=ÉquipeB, row[8]=ScoreA, row[9]=ScoreB
  // Export Google Sheets : pas de colonne "G" → offset = 0
  //   row[4]=ÉquipeA, row[5]=vs, row[6]=ÉquipeB, row[7]=ScoreA, row[8]=ScoreB
  let c = 1; // offset par défaut = local
  for (const row of rows) {
    if (!row || row.every(x => x === null)) continue;
    if (row[0] === 'ID ') {
      // header présent : détecter par col[4]
      // Local → 'G', GSheets → 'Équipe A' (ou autre)
      const col4 = row[4] ? String(row[4]).trim() : '';
      c = (col4 === 'G') ? 1 : 0;
      break;
    }
    break; // pas de header trouvé, garder offset=1
  }

  for (const row of rows) {
    if (!row || row.every(x => x === null)) continue;

    // Ligne header
    if (row[1] === 'Date' || row[0] === 'ID ') continue;

    // Détection frontière phase finale
    if (typeof row[1] === 'string' && row[1].toUpperCase().includes('PHASE FINALE')) {
      inPhaseFinale = true;
      continue;
    }

    // Ligne séparateur journée : col B = "JOURNÉE 01"
    if (!inPhaseFinale && typeof row[1] === 'string' &&
        row[1].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').startsWith('JOURNEE')) {
      const m = row[1].match(/(\d+)/);
      if (m) currentJournee = parseInt(m[1]);
      continue;
    }

    // ── Phase finale ──────────────────────────────────
    if (inPhaseFinale) {
      // Détection ronde depuis col[4+c] (ex: "1/8e finale", "1/4 finale")
      const possibleRound = row[4 + c] ? row[4 + c].toString().trim() : '';
      if (ROUND_KEYWORDS.some(k => possibleRound.toLowerCase().includes(k))) {
        currentRound = normalizeRound(possibleRound);
      }
      if (!currentRound) continue;

      const rawDate = row[1];
      const date = rawDate instanceof Date
        ? rawDate
        : parseStringDate(rawDate);

      // Équipes : col[4+c] et col[6+c]
      const rawTeamA = row[4 + c] ? row[4 + c].toString().trim() : '';
      const rawTeamB = row[6 + c] ? row[6 + c].toString().trim() : '';
      // Ne pas prendre le nom de ronde comme nom d'équipe
      const isRound = (s) => ROUND_KEYWORDS.some(k => s.toLowerCase().includes(k));
      const teamA = (!isRound(rawTeamA) && rawTeamA) || 'À déterminer';
      const teamB = (!isRound(rawTeamB) && rawTeamB) || 'À déterminer';

      const scoreA = typeof row[7 + c] === 'number' ? row[7 + c] : null;
      const scoreB = typeof row[8 + c] === 'number' ? row[8 + c] : null;

      matches.push({
        id:       null,
        journee:  null,
        phase:    currentRound,
        date,
        dateRaw:  typeof rawDate === 'string' ? rawDate : null,
        venue:    row[2] ? row[2].toString().trim() : '',
        time:     row[3] ? row[3].toString().trim() : '',
        group:    (c === 1 && row[4]) ? row[4].toString().trim().toUpperCase() : '',
        teamA,
        teamB,
        scoreA,
        scoreB,
        status:      (scoreA !== null && scoreB !== null) ? 'played' : 'upcoming',
        restTeams:   '',
        referee:     row[10 + c] ? row[10 + c].toString().trim() : '',
        ref1:        row[11 + c] ? row[11 + c].toString().trim() : '',
        ref2:        row[12 + c] ? row[12 + c].toString().trim() : '',
        coordinator: row[13 + c] ? row[13 + c].toString().trim() : '',
      });
      continue;
    }

    // ── Match phase de groupes ────────────────────────
    const rawDate = row[1];
    const teamA = normalizeTeamName(row[4 + c]);  // col E (GSheets) ou col F (local)
    const teamB = normalizeTeamName(row[6 + c]);  // col G (GSheets) ou col H (local)

    if (!rawDate || !teamA || !teamB) continue;

    const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(date.getTime())) continue;

    const scoreA = typeof row[7 + c] === 'number' ? row[7 + c] : null;
    const scoreB = typeof row[8 + c] === 'number' ? row[8 + c] : null;

    // Détection forfait : col "Au repos" (index 9+c) peut contenir "FORFAIT A"/"FORFAIT B"
    const forfaitCol = row[9 + c] ? row[9 + c].toString().trim().toUpperCase() : '';
    let status, finalScoreA, finalScoreB;
    if (forfaitCol === 'FORFAIT A') {
      status = 'forfait_a'; finalScoreA = 0; finalScoreB = 3;
    } else if (forfaitCol === 'FORFAIT B') {
      status = 'forfait_b'; finalScoreA = 3; finalScoreB = 0;
    } else {
      status = (scoreA !== null && scoreB !== null) ? 'played' : 'upcoming';
      finalScoreA = scoreA;
      finalScoreB = scoreB;
    }

    matches.push({
      id:        row[0] ? parseInt(row[0]) : null,
      journee:   currentJournee,
      date,
      venue:     row[2] ? row[2].toString().trim() : '',
      time:      row[3] ? row[3].toString().trim() : '',
      group:     (c === 1 && row[4]) ? row[4].toString().trim().toUpperCase() : '',
      teamA,
      teamB,
      scoreA:    finalScoreA,
      scoreB:    finalScoreB,
      status,
      restTeams: forfaitCol.startsWith('FORFAIT') ? '' : (row[9 + c] ? row[9 + c].toString().trim() : ''),
      referee:     row[10 + c] ? row[10 + c].toString().trim() : '',
      ref1:        row[11 + c] ? row[11 + c].toString().trim() : '',
      ref2:        row[12 + c] ? row[12 + c].toString().trim() : '',
      coordinator: row[13 + c] ? row[13 + c].toString().trim() : '',
    });
  }

  return matches;
}

// ─── ÉQUIPES ──────────────────────────────────

function parseTeams(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const teams = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const name = normalizeTeamName(row[0]);
    const group = row[1] ? row[1].toString().trim().toUpperCase() : '';
    if (name && group) {
      teams.push({ name, group });
    }
  }
  return teams;
}

// ─── CLASSEMENT ───────────────────────────────

function parseStandings(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const standings = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || typeof row[0] !== 'string') continue;
    standings.push({
      team:         normalizeTeamName(row[0]),
      played:       Number(row[1]) || 0,
      won:          Number(row[2]) || 0,
      drawn:        Number(row[3]) || 0,
      lost:         Number(row[4]) || 0,
      goalsFor:     Number(row[5]) || 0,
      goalsAgainst: Number(row[6]) || 0,
      goalDiff:     Number(row[7]) || 0,
      points:       Number(row[8]) || 0,
    });
  }
  return standings;
}

// ─── CLASSEMENT BUTEURS (brut — jointure après) ───

function parseRawScorers(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const scorers = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[0] === null) continue;
    const rawPlayer = row[1];
    if (rawPlayer === null) continue;
    scorers.push({
      rank:         Number(row[0]) || i,
      playerNumber: parseInt(rawPlayer) || 0,   // numéro de maillot
      team:         normalizeTeamName(row[2]),
      goals:        Number(row[3]) || 0,
    });
  }
  return scorers;
}

// ─── CLASSEMENT PASSEURS (brut) ────────────────

function parseRawAssisters(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const assisters = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[0] === null) continue;
    const rawPlayer = row[1];
    if (rawPlayer === null) continue;
    // Format "N10" ou numéro direct
    const numStr = rawPlayer.toString().replace(/\D/g, '');
    assisters.push({
      rank:         Number(row[0]) || i,
      playerNumber: parseInt(numStr) || 0,
      team:         normalizeTeamName(row[2]),
      assists:      Number(row[3]) || 0,
    });
  }
  return assisters;
}

// ─── FEUILLE JOUEURS (dans le fichier horaire — vide pour l'instant) ───

function parseJoueursSheet(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const players = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    const num = parseInt(row[0]);
    if (isNaN(num)) continue;
    players.push({
      number:      num,
      name:        row[1] ? row[1].toString().trim() : `Joueur #${num}`,
      firstName:   null,
      lastName:    null,
      team:        normalizeTeamName(row[2]),
      goals:       Number(row[3]) || 0,
      assists:     Number(row[4]) || 0,
      position:    null,
      hasFullData: !!row[1],
    });
  }
  return players;
}

// ─── FICHIER LISTES JOUEURS (Groupe A ou B) ────

/**
 * Retourne true si la cellule (r, c) a un formatage barré (strikethrough).
 * Nécessite cellStyles: true dans XLSX.read().
 */
function isCellStrike(ws, r, c) {
  if (c < 0) return false;
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return false;
  // Style cellule entière
  if (cell.s?.font?.strike || cell.s?.font?.strikethrough) return true;
  // Texte riche (barré partiel sur un run)
  if (Array.isArray(cell.r)) return cell.r.some(run => run.s?.strike || run.s?.strikethrough);
  return false;
}

function parsePlayersFile(buffer, corrId) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true });
  const allPlayers = [];
  const allTeamMeta = [];

  for (const sheetName of wb.SheetNames) {
    const teamName = SHEET_TO_TEAM[sheetName] ?? normalizeTeamName(sheetName);
    const ws = wb.Sheets[sheetName];
    const { players, teamMeta } = parseTeamSheet(ws, teamName);
    allPlayers.push(...players);
    if (teamMeta) allTeamMeta.push(teamMeta);
  }

  log.info('PLAYERS_FILE_PARSED', { corrId, sheets: wb.SheetNames.length, players: allPlayers.length });
  return { players: allPlayers, teamMeta: allTeamMeta };
}

/**
 * Parser une feuille d'équipe avec détection dynamique des colonnes
 */
function parseTeamSheet(ws, teamName) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  if (!rows || rows.length < 8) return { players: [], teamMeta: null };

  // Métadonnées équipe (rows 0-4)
  const extractMeta = (row, label) => {
    if (!row) return null;
    const flat = row.join(' ');
    const idx = flat.toLowerCase().indexOf(label.toLowerCase());
    if (idx === -1) return null;
    // Valeur après le label ':'
    const parts = row.filter(c => c !== null).map(c => c.toString().trim());
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].toLowerCase().includes(label.toLowerCase())) {
        // Cherche une valeur dans la même cellule après ':' ou dans la suivante
        const after = parts[i].split(':').slice(1).join(':').trim();
        if (after) return after;
        if (parts[i + 1]) return parts[i + 1].trim();
      }
    }
    return null;
  };

  const teamMeta = {
    name:    teamName,
    email:   extractMeta(rows[1], 'courriel'),
    phone:   extractMeta(rows[2], 'urgence'),
    coach:   extractMeta(rows[3], 'coach'),
    captain: extractMeta(rows[4], 'capitaine'),
  };

  // Row 7 (index 6) = headers des colonnes joueurs
  const headerRow = rows[6] ?? [];
  const headers = headerRow.map(h => (h ?? '').toString().toLowerCase().trim());

  // Détection dynamique des index de colonnes
  const findCol = (...keywords) => {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const numIdx  = 0;  // Toujours col 0
  const posIdx  = findCol('poste');
  const preIdx  = findCol('prénom', 'prenom');
  const nomIdx  = (() => {
    // NOM est après PRÉNOM dans les headers
    for (let i = preIdx + 1; i < headers.length; i++) {
      if (headers[i] === 'nom' || (headers[i].includes('nom') && !headers[i].includes('pr'))) return i;
    }
    return -1;
  })();
  const ageIdx  = findCol('ge', 'age', 'âge');
  const oriIdx  = findCol('origine');

  const isFormula = (v) => typeof v === 'string' && v.startsWith('=');
  const cleanStr  = (v) => {
    if (v === null || v === undefined) return null;
    const s = v.toString().trim();
    if (isFormula(s) || s === '') return null;
    return s;
  };

  const players = [];
  for (let i = 7; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Numéro maillot — peut être "1 (GK)" ou 1.0
    const rawNum = row[numIdx];
    if (rawNum === null || rawNum === undefined) continue;
    const numStr = rawNum.toString().replace(/\D/g, '');
    const num = parseInt(numStr);
    if (isNaN(num) || num === 0) continue;

    const firstName = preIdx >= 0 ? cleanStr(row[preIdx]) : null;
    const lastName  = nomIdx >= 0 ? cleanStr(row[nomIdx]) : null;
    const posRaw    = posIdx >= 0 ? cleanStr(row[posIdx]) : null;
    const ageRaw    = ageIdx >= 0 ? row[ageIdx] : null;

    // Détection banni :
    // 1. Strikethrough via cellStyles (fonctionne sur .xls, parfois .xlsx)
    const hasStrike = [numIdx, preIdx, nomIdx]
      .filter(c => c >= 0)
      .some(c => isCellStrike(ws, i, c));
    // 2. Marqueur texte (X) dans prénom ou nom (ex: "ALLAOUA KEDDAM (X)")
    const BAN_MARKER = /\s*\(\s*[Xx]\.?\s*\)\s*$/;
    const firstNameHasX = firstName ? BAN_MARKER.test(firstName) : false;
    const lastNameHasX  = lastName  ? BAN_MARKER.test(lastName)  : false;
    const isBanned = hasStrike || firstNameHasX || lastNameHasX;

    // Nettoyer le marqueur (X) du nom affiché
    const cleanName = (s) => s ? s.replace(BAN_MARKER, '').trim() : s;
    const cleanedFirst = cleanName(firstName);
    const cleanedLast  = cleanName(lastName);

    players.push({
      number:      num,
      firstName:   cleanedFirst,
      lastName:    cleanedLast,
      name:        [cleanedFirst, cleanedLast].filter(Boolean).join(' ').trim() || `Joueur #${num}`,
      position:    posRaw ? (POSITION_LABELS[posRaw] ?? posRaw) : null,
      positionRaw: posRaw,
      age:         typeof ageRaw === 'number' ? ageRaw : null,
      origin:      oriIdx >= 0 ? cleanStr(row[oriIdx]) : null,
      team:        teamName,
      goals:       0,   // enrichi après jointure
      assists:     0,   // enrichi après jointure
      hasFullData: !!(firstName || lastName),
      banned:      isBanned,
    });
  }

  return { players, teamMeta };
}

// ─────────────────────────────────────────────
// POST-PROCESSING : jointures et enrichissement
// ─────────────────────────────────────────────

/**
 * Résout les noms des buteurs/passeurs depuis la liste de joueurs
 * Retourne des scorers/assisters enrichis avec le nom du joueur
 */
export function resolvePlayerNames(rawScorers, rawAssisters, players) {
  const playerMap = new Map();
  for (const p of players) {
    const key = `${p.number}:${p.team}`;
    playerMap.set(key, p);
  }

  // Enrichit un tableau de classement (scorers ou assisters)
  const enrich = (items, statKey) => items.map(item => {
    const key = `${item.playerNumber}:${item.team}`;
    const player = playerMap.get(key);
    return {
      ...item,
      playerName: player?.name ?? `Joueur #${item.playerNumber}`,
      hasFullData: player?.hasFullData ?? false,
      [statKey]: item[statKey],
    };
  });

  const scorers   = enrich(rawScorers, 'goals');
  const assisters = enrich(rawAssisters, 'assists');

  // Enrichit les joueurs avec leurs stats
  for (const s of rawScorers) {
    const key = `${s.playerNumber}:${s.team}`;
    const p = playerMap.get(key);
    if (p) p.goals = s.goals;
  }
  for (const a of rawAssisters) {
    const key = `${a.playerNumber}:${a.team}`;
    const p = playerMap.get(key);
    if (p) p.assists = a.assists;
  }

  return { scorers, assisters, players: [...playerMap.values()] };
}
