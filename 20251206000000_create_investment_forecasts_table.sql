/*
  # Create forecasts table

  1. New Tables
    - `forecasts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `year` (integer, unique per user)
      - `value` (numeric forecast amount)
      - `method` (text describing the algorithm)
      - `note` (text describing context)
      - `source` (text identifying origin component)
      - `created_at` / `updated_at`

  2. Security
    - Enable RLS
    - Policies so users can manage their own forecasts
*/

CREATE TABLE IF NOT EXISTS forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year BETWEEN 1900 AND 2500),
  value numeric NOT NULL,
  method text NOT NULL,
  note text,
  source text DEFAULT 'investment',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, year)
);

ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own forecasts"
  ON forecasts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own forecasts"
  ON forecasts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own forecasts"
  ON forecasts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own forecasts"
  ON forecasts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_forecasts_user_year
  ON forecasts(user_id, year);
