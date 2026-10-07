CREATE TABLE IF NOT EXISTS daily_challenges (
  id uuid PRIMARY KEY,
  challenge_date date NOT NULL UNIQUE,
  scoring_version integer NOT NULL CHECK (scoring_version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_challenge_pieces (
  challenge_id uuid NOT NULL REFERENCES daily_challenges(id),
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 5),
  excerpt_id text NOT NULL,
  work_id text NOT NULL,
  track_snapshot jsonb NOT NULL,
  PRIMARY KEY (challenge_id, position),
  UNIQUE (challenge_id, excerpt_id),
  UNIQUE (challenge_id, work_id)
);

CREATE TABLE IF NOT EXISTS daily_results (
  id uuid PRIMARY KEY,
  challenge_id uuid NOT NULL REFERENCES daily_challenges(id),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 50),
  total_score integer NOT NULL CHECK (total_score BETWEEN 0 AND 5000),
  round_details jsonb NOT NULL CHECK (jsonb_typeof(round_details) = 'array' AND jsonb_array_length(round_details) = 5),
  run_token_hash text NOT NULL UNIQUE,
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_results_leaderboard ON daily_results (challenge_id, total_score DESC, submitted_at, id);
