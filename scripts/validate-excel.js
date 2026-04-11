#!/usr/bin/env node
// scripts/validate-excel.js
// Usage : npm run validate
//
// Valide les fichiers Excel LNQ 2026 et génère un snapshot JSON daté
// dans public/data/snapshots/ pour conserver l'historique des données.

import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const DATA_DIR  = join(ROOT, 'public', 'data');
const SNAP_DIR  = join(DATA_DIR, 'snapshots');

const errors   = [];
const warnings = [];

function ok(msg)   { console.log(`   ✅ ${msg}`); }
function warn(msg) { warnings.push(msg); console.log(`   ⚠️  ${msg}`); }
function fail(msg) { errors.push(msg);   console.log(`   ❌ ${msg}`); }

// ─── Validation HORAIRE_2026.xlsx ─────────────────────────────────────────────

function validateHoraire() {
  const filePath = join(DATA_DIR, 'HORAIRE_2026.xlsx');
  console.log('\n📋 Validation de HORAIRE_2026.xlsx...');

  if (!existsSync(filePath)) {
    fail('Fichier introuvable : public/data/HORAIRE_2026.xlsx');
    return null;
  }

  let wb;
  try {
    wb = XLSX.read(readFileSync(filePath), { type: 'buffer', cellDates: true });
  } catch (e) {
    fail(`Impossible de lire le fichier : ${e.message}`);
    return null;
  }

  // Feuilles requises
  const REQUIRED_SHEETS = ['MATCHS', 'EQUIPES', 'CLASSEMENT'];
  for (const sheet of REQUIRED_SHEETS) {
    if (wb.SheetNames.includes(sheet)) ok(`Feuille "${sheet}" présente`);
    else fail(`Feuille manquante : "${sheet}"`);
  }

  // Validation MATCHS
  const ws = wb.Sheets['MATCHS'];
  if (ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    let matchCount = 0, scoreErrors = 0, dateErrors = 0;
    let inPhaseFinale = false;

    for (const row of rows.slice(1)) {
      if (!row || row.every(c => c === null)) continue;

      if (typeof row[1] === 'string' && row[1].toUpperCase().includes('PHASE FINALE')) {
        inPhaseFinale = true;
        continue;
      }

      // Compter seulement les matchs de groupe (avec ID numérique)
      if (!inPhaseFinale && row[0] !== null && !isNaN(parseFloat(row[0]))) {
        matchCount++;

        if (!(row[1] instanceof Date) && !row[1]) dateErrors++;

        if (row[8] !== null && typeof row[8] !== 'number')
          warn(`Match ${row[0]} — Score A non numérique : "${row[8]}"`);
        if (row[9] !== null && typeof row[9] !== 'number')
          warn(`Match ${row[0]} — Score B non numérique : "${row[9]}"`);
      }
    }

    if (dateErrors > 0) warn(`${dateErrors} match(s) avec date manquante`);
    ok(`${matchCount} matchs de groupe détectés`);
  }

  // Validation EQUIPES
  const wsEq = wb.Sheets['EQUIPES'];
  if (wsEq) {
    const eqRows = XLSX.utils.sheet_to_json(wsEq, { header: 1, defval: null });
    const teams = eqRows.slice(1).filter(r => r && r[0]);
    ok(`${teams.length} équipes dans la feuille EQUIPES`);
    if (teams.length < 16) warn(`Seulement ${teams.length} équipes — attendu 18`);
  }

  return wb;
}

// ─── Validation fichiers joueurs ───────────────────────────────────────────────

function validatePlayerFile(filename) {
  const filePath = join(DATA_DIR, filename);
  console.log(`\n📋 Validation de ${filename}...`);

  if (!existsSync(filePath)) {
    warn(`Fichier absent : public/data/${filename}`);
    return;
  }

  let wb;
  try {
    wb = XLSX.read(readFileSync(filePath), { type: 'buffer' });
  } catch (e) {
    fail(`Impossible de lire ${filename} : ${e.message}`);
    return;
  }

  let totalPlayers = 0;
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    // Joueurs à partir de la ligne 8 (index 7)
    const players = rows.slice(7).filter(r => r && r[0] !== null && !isNaN(parseInt(r[0])));
    totalPlayers += players.length;
  }
  ok(`${wb.SheetNames.length} équipes, ${totalPlayers} joueurs au total`);
}

// ─── Génération snapshot JSON ──────────────────────────────────────────────────

function generateSnapshot(wb) {
  if (!wb) return;

  mkdirSync(SNAP_DIR, { recursive: true });

  const now       = new Date();
  const timestamp = now.toISOString().slice(0, 10); // YYYY-MM-DD

  const ws   = wb.Sheets['MATCHS'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Extraire tous les matchs de groupe avec scores
  const matches = rows
    .filter(r => r && r[0] !== null && !isNaN(parseFloat(r[0])))
    .map(r => ({
      id:     parseInt(r[0]),
      date:   r[1] instanceof Date ? r[1].toISOString().slice(0, 10) : String(r[1] ?? ''),
      venue:  String(r[2] ?? '').trim(),
      teamA:  String(r[5] ?? '').trim(),
      teamB:  String(r[7] ?? '').trim(),
      scoreA: typeof r[8] === 'number' ? r[8] : null,
      scoreB: typeof r[9] === 'number' ? r[9] : null,
    }));

  const played = matches.filter(m => m.scoreA !== null && m.scoreB !== null);

  const snapshot = {
    generatedAt: now.toISOString(),
    source:      'HORAIRE_2026.xlsx',
    totalMatches: matches.length,
    playedMatches: played.length,
    matches,
  };

  const snapPath = join(SNAP_DIR, `snapshot_${timestamp}.json`);
  writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));

  console.log(`\n💾 Snapshot généré : public/data/snapshots/snapshot_${timestamp}.json`);
  console.log(`   ${matches.length} matchs · ${played.length} joués`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

console.log('═'.repeat(55));
console.log('🔍  Validation LNQ 2026 — ' + new Date().toLocaleString('fr-CA'));
console.log('═'.repeat(55));

const wb = validateHoraire();
validatePlayerFile('LISTE_GROUPE_A.xlsx');
validatePlayerFile('LISTE_GROUPE_B.xlsx');
generateSnapshot(wb);

console.log('\n' + '─'.repeat(55));

if (warnings.length > 0) {
  console.log(`\n⚠️  ${warnings.length} avertissement(s) :`);
  warnings.forEach(w => console.log(`   • ${w}`));
}

if (errors.length > 0) {
  console.log(`\n❌ ${errors.length} erreur(s) critique(s) :`);
  errors.forEach(e => console.log(`   • ${e}`));
  console.log('\n🚫 Corriger avant de déployer.\n');
  process.exit(1);
} else {
  console.log('\n✅ Tous les fichiers sont valides — prêt pour déploiement.\n');
}
