-- Health profiles table: stores AI-analyzed fitness profile per user
-- Generated once on device connection, updated monthly or on major milestones

CREATE TABLE IF NOT EXISTS health_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL UNIQUE,
  profile jsonb NOT NULL DEFAULT '{}',
  data_range_start date,
  data_range_end date,
  total_workouts_analyzed int DEFAULT 0,
  generated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS health_profiles_user_id_idx ON health_profiles(user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_health_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER health_profiles_updated_at
  BEFORE UPDATE ON health_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_health_profiles_updated_at();
