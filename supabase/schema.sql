-- ============================================================
-- CNQ 2026 — Schéma Supabase
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Matches ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matches (
  id           SERIAL PRIMARY KEY,
  journee      INTEGER NOT NULL,
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
  status       TEXT NOT NULL DEFAULT 'upcoming', -- 'upcoming' | 'played'
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (journee, team_a, team_b)  -- permet upsert sans doublon
);

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
