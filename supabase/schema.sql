-- ============================================================
-- CNQ 2026 — Schéma Supabase
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Matches ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id           SERIAL PRIMARY KEY,
  journee      INTEGER,               -- NULL pour les matchs de phase finale
  phase        TEXT,                  -- '1/8e de finale' | 'Quarts de finale' | 'Demi-finales' | 'Finale'
  date         DATE,
  time         TEXT,
  venue        TEXT,
  group_name   TEXT,          -- 'A' ou 'B'
  team_a       TEXT NOT NULL,
  team_b       TEXT NOT NULL,
  score_a      INTEGER,
  score_b      INTEGER,
  referee      TEXT,
  ref1         TEXT,
  ref2         TEXT,
  coordinator  TEXT,
  status       TEXT NOT NULL DEFAULT 'upcoming', -- 'upcoming' | 'live' | 'played'
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index uniques partiels (NULL != NULL en SQL, donc 2 index selon le contexte)
CREATE UNIQUE INDEX IF NOT EXISTS matches_journee_teams
  ON matches (journee, team_a, team_b)
  WHERE journee IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matches_phase_teams
  ON matches (phase, team_a, team_b)
  WHERE phase IS NOT NULL;

-- ── Match events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_events (
  id                     SERIAL PRIMARY KEY,
  match_id               INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  type                   TEXT NOT NULL,  -- 'goal' | 'assist' | 'yellow' | 'red' | 'sub'
  team                   TEXT,
  player_num             INTEGER,        -- numéro de maillot
  player_name            TEXT,           -- nom (optionnel)
  minute                 INTEGER,
  secondary_player_num   INTEGER,        -- remplacement : joueur sortant
  secondary_player_name  TEXT,
  created_by             UUID REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── updated_at auto-update ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row Level Security ────────────────────────────────────────
ALTER TABLE matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events  ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut LIRE
CREATE POLICY "public read matches"
  ON matches FOR SELECT USING (true);

CREATE POLICY "public read events"
  ON match_events FOR SELECT USING (true);

-- Seuls les admins authentifiés peuvent ÉCRIRE
CREATE POLICY "auth write matches"
  ON matches FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth write events"
  ON match_events FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── Suspensions ───────────────────────────────────────────────
-- À exécuter une fois si la table n'existe pas encore
CREATE TABLE IF NOT EXISTS suspensions (
  id               SERIAL PRIMARY KEY,
  team             TEXT NOT NULL,
  player_num       INTEGER,
  player_name      TEXT,
  matches_remaining INTEGER NOT NULL DEFAULT 1,  -- matchs restants à purger
  reason           TEXT,          -- 'red_card' | 'behavior' | 'manual'
  type             TEXT NOT NULL DEFAULT 'auto', -- 'auto' | 'manual'
  match_id         INTEGER REFERENCES matches(id) ON DELETE SET NULL, -- match où le carton a été reçu
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER suspensions_updated_at
  BEFORE UPDATE ON suspensions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read suspensions"
  ON suspensions FOR SELECT USING (true);

CREATE POLICY "auth write suspensions"
  ON suspensions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Ajouter postpone_reason à matches si pas encore fait
ALTER TABLE matches ADD COLUMN IF NOT EXISTS postpone_reason TEXT;

-- ── Match Lineup (feuille de match) ──────────────────────────
CREATE TABLE IF NOT EXISTS match_lineup (
  id          BIGSERIAL PRIMARY KEY,
  match_id    BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team        TEXT NOT NULL,
  player_num  INT,
  player_name TEXT,
  role        TEXT NOT NULL DEFAULT 'starter', -- starter | sub | absent
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, team, player_num)
);

ALTER TABLE match_lineup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read lineup"
  ON match_lineup FOR SELECT USING (true);

CREATE POLICY "auth write lineup"
  ON match_lineup FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── Joueurs bannis ────────────────────────────────────────────────
-- Stockage permanent des joueurs exclus du tournoi (barré dans Excel ou banni manuellement).
-- Survit aux mises à jour du fichier Excel.
CREATE TABLE IF NOT EXISTS banned_players (
  id          BIGSERIAL PRIMARY KEY,
  team        TEXT NOT NULL,
  player_num  INTEGER,         -- peut être NULL si conflit de numéro avec un joueur actif
  player_name TEXT NOT NULL,
  reason      TEXT DEFAULT 'excel',   -- 'excel' | 'manual'
  notes       TEXT,                   -- notes admin optionnelles
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team, player_name)
);

ALTER TABLE banned_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read banned_players"
  ON banned_players FOR SELECT USING (true);

CREATE POLICY "auth write banned_players"
  ON banned_players FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── Points de pénalité (déductions au classement) ──────────────
CREATE TABLE IF NOT EXISTS penalty_points (
  id         BIGSERIAL PRIMARY KEY,
  team       TEXT NOT NULL,
  points     INTEGER NOT NULL,  -- négatif ex: -2, ou positif si bonus
  reason     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE penalty_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read penalty_points"
  ON penalty_points FOR SELECT USING (true);

CREATE POLICY "auth write penalty_points"
  ON penalty_points FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
