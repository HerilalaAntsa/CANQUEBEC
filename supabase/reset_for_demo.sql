-- ══════════════════════════════════════════════════════════
-- RESET COMPLET — Scores + Événements
-- À exécuter dans : Supabase → SQL Editor
-- ⚠️  IRRÉVERSIBLE — fait un backup mental avant
-- ══════════════════════════════════════════════════════════

-- 1. Supprimer tous les événements (buts, cartons, remplacements, passes)
DELETE FROM match_events;

-- 2. Remettre tous les scores à 0 et statut → upcoming
UPDATE matches
SET
  score_a = NULL,
  score_b = NULL,
  status  = 'upcoming';

-- 3. Vérification — doit retourner 0
SELECT COUNT(*) AS evenements_restants FROM match_events;

-- 4. Vérification — tous les matchs doivent être 'upcoming'
SELECT status, COUNT(*) FROM matches GROUP BY status;
