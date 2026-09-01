/*
  # Add settings column to profiles

  Stores per-user preferences like voucher column locks so they sync across devices.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
