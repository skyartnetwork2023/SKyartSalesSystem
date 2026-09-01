/*
  # Create ad metrics table

  1. New Tables
    - `ad_metrics`
      - Tracks per-day view counts for captive portal ads
  2. Security
    - Enable RLS
    - Allow supervisor accounts to read metrics
*/

CREATE TABLE IF NOT EXISTS ad_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  asset_name text NOT NULL,
  view_date date NOT NULL,
  views integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (bucket_id, asset_name, view_date)
);

ALTER TABLE ad_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisors can view ad metrics"
  ON ad_metrics FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'supervisor'
    )
  );

CREATE INDEX idx_ad_metrics_bucket_asset_date
  ON ad_metrics(bucket_id, asset_name, view_date);

CREATE INDEX idx_ad_metrics_view_date
  ON ad_metrics(view_date);
