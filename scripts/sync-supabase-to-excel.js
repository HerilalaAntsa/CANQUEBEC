#!/usr/bin/env node
/**
 * sync-supabase-to-excel.js
 * Lit les matchs depuis Supabase et met à jour les scores dans l'Excel local.
 *
 * Usage :
 *   node scripts/sync-supabase-to-excel.js
 *
 * Requis : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
 */

import 'dotenv/config';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY  = process.env.VITE_SUPABASE_ANON_KEY;
const EXCEL_PATH    = resolve(ROOT, 'public/data/HORAIRE_2026.xlsx');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY requis dans .env');
  process.exit(1);
}

if (!existsSync(EXCEL_PATH)) {
  console.error('❌ Fichier Excel introuvable :', EXCEL_PATH);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📥 Lecture des matchs depuis Supabase...');
  const { data: matches, error } = await supabase
    .from('matches')
    .select('journee, team_a, team_b, score_a, score_b, status')
    .not('journee', 'is', null)
    .eq('status', 'played');

  if (error) { console.error('❌ Erreur Supabase :', error.message); process.exit(1); }
  console.log(`✅ ${matches.length} matchs joués trouvés`);

  // Index par clé journee:teamA:teamB
  const scoreMap = {};
  for (const m of matches) {
    const key = `${m.journee}:${m.team_a.toUpperCase().trim()}:${m.team_b.toUpperCase().trim()}`;
    scoreMap[key] = { scoreA: m.score_a, scoreB: m.score_b };
  }

  // ── Lire Excel ──────────────────────────────────────────────────────────────
  console.log('📂 Lecture Excel :', EXCEL_PATH);
  const buf  = readFileSync(EXCEL_PATH);
  const wb   = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const wsName = wb.SheetNames[0];
  const ws   = wb.Sheets[wsName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let updated = 0;
  let currentJournee = 0;
  let inPhaseFinale  = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => c === null)) continue;
    if (row[1] === 'Date' || row[0] === 'ID ') continue;

    if (typeof row[1] === 'string' && row[1].toUpperCase().includes('PHASE FINALE')) {
      inPhaseFinale = true; continue;
    }
    if (inPhaseFinale) continue;

    if (typeof row[1] === 'string' && row[1].toUpperCase().startsWith('JOURNÉE')) {
      const m = row[1].match(/(\d+)/);
      if (m) currentJournee = parseInt(m[1]);
      continue;
    }

    const teamA = (row[5] ?? '').toString().toUpperCase().trim();
    const teamB = (row[7] ?? '').toString().toUpperCase().trim();
    if (!teamA || !teamB) continue;

    const key   = `${currentJournee}:${teamA}:${teamB}`;
    const score = scoreMap[key];
    if (!score) continue;

    // Col I (index 8) = score équipe A, Col J (index 9) = score équipe B
    // On récupère l'adresse des cellules à partir du row index
    const ref = XLSX.utils.encode_cell({ r: i, c: 8 });
    const ref2 = XLSX.utils.encode_cell({ r: i, c: 9 });

    ws[ref]  = { t: 'n', v: score.scoreA };
    ws[ref2] = { t: 'n', v: score.scoreB };
    updated++;
    console.log(`  ✏️  J${currentJournee} ${teamA} ${score.scoreA}-${score.scoreB} ${teamB}`);
  }

  if (updated === 0) {
    console.log('ℹ️  Aucun score à mettre à jour.');
    return;
  }

  // ── Écrire Excel ────────────────────────────────────────────────────────────
  const outBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeFileSync(EXCEL_PATH, outBuf);
  console.log(`\n✅ ${updated} scores mis à jour dans ${EXCEL_PATH}`);
  console.log('👉 Prochaine étape : git add -A && git commit -m "sync: scores mis à jour" && git push');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
