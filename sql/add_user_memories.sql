-- Add user_memories table for memory bank feature

CREATE TABLE IF NOT EXISTS user_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  memory_type text NOT NULL CHECK (memory_type IN ('fact', 'preference', 'goal', 'reminder')),
  content text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  scheduled_for timestamptz,
  reminded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Indexes for efficient queries
CREATE INDEX idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX idx_user_memories_scheduled ON user_memories(scheduled_for)
  WHERE reminded_at IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_user_memories_active ON user_memories(user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- Add comment
COMMENT ON TABLE user_memories IS 'Stores user-shared information, preferences, goals, and scheduled reminders for personalized coaching';
