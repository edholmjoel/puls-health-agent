-- Fix conversation_state table schema

-- Add user_id column (foreign key to users table)
ALTER TABLE conversation_state
ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- Add created_at column
ALTER TABLE conversation_state
ADD COLUMN created_at timestamptz DEFAULT now();

-- Copy phone_number data to user_id (match with users table)
UPDATE conversation_state cs
SET user_id = u.id
FROM users u
WHERE cs.phone_number = u.phone_number;

-- Optional: Remove phone_number column (no longer needed)
-- Uncomment the line below if you want to remove it:
-- ALTER TABLE conversation_state DROP COLUMN phone_number;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversation_state_user_id ON conversation_state(user_id);
