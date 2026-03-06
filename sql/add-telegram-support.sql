-- Migration: Add Telegram Bot support to users table
-- Description: Adds telegram_user_id and platform columns to support both WhatsApp and Telegram platforms

-- Add new columns to users table
ALTER TABLE users
  ADD COLUMN telegram_user_id BIGINT UNIQUE,
  ADD COLUMN platform VARCHAR(20) DEFAULT 'whatsapp' NOT NULL;

-- Make phone_number nullable (Telegram users won't have phone numbers)
ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;

-- Add constraint to ensure either phone_number OR telegram_user_id exists
ALTER TABLE users
  ADD CONSTRAINT check_platform_identifier
    CHECK (
      (platform = 'whatsapp' AND phone_number IS NOT NULL) OR
      (platform = 'telegram' AND telegram_user_id IS NOT NULL)
    );

-- Create index for Telegram user lookups
CREATE INDEX idx_users_telegram_user_id ON users(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

-- Backfill existing users with whatsapp platform
UPDATE users SET platform = 'whatsapp' WHERE platform IS NULL OR platform = 'whatsapp';

-- Verify migration
-- SELECT telegram_user_id, platform, phone_number FROM users LIMIT 5;
