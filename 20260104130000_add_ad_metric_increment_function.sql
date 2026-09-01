/*
  # Increment ad metric helper

  Creates a helper function that increments or upserts per-asset view counts.
*/

CREATE OR REPLACE FUNCTION public.increment_ad_metric(
  p_bucket_id text,
  p_asset_name text,
  p_view_date date DEFAULT now()::date,
  p_increment integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_bucket_id IS NULL OR p_asset_name IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.ad_metrics (bucket_id, asset_name, view_date, views, created_at, updated_at)
  VALUES (p_bucket_id, p_asset_name, p_view_date, GREATEST(p_increment, 1), now(), now())
  ON CONFLICT (bucket_id, asset_name, view_date)
  DO UPDATE SET
    views = public.ad_metrics.views + GREATEST(p_increment, 1),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ad_metric(text, text, date, integer)
  TO anon, authenticated, service_role;

-- Allow portal clients (anon role) to insert/update metrics through the function
DROP POLICY IF EXISTS "Anon can insert ad metrics" ON public.ad_metrics;
CREATE POLICY "Anon can insert ad metrics"
  ON public.ad_metrics FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update ad metrics" ON public.ad_metrics;
CREATE POLICY "Anon can update ad metrics"
  ON public.ad_metrics FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
