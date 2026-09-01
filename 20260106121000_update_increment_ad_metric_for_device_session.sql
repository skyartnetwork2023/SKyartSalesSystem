/*
  # Update increment_ad_metric to support device/session columns
  Adds parameters for client_mac, ap_mac, and client_ip, and updates logic to upsert with these fields.
*/
CREATE OR REPLACE FUNCTION public.increment_ad_metric(
  p_bucket_id text,
  p_asset_name text,
  p_view_date date DEFAULT now()::date,
  p_increment integer DEFAULT 1,
  p_client_mac text DEFAULT NULL,
  p_ap_mac text DEFAULT NULL,
  p_client_ip text DEFAULT NULL
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

  INSERT INTO public.ad_metrics (
    bucket_id, asset_name, view_date, views, created_at, updated_at,
    client_mac, ap_mac, client_ip
  )
  VALUES (
    p_bucket_id, p_asset_name, p_view_date, GREATEST(p_increment, 1), now(), now(),
    p_client_mac, p_ap_mac, p_client_ip
  )
  ON CONFLICT (bucket_id, asset_name, view_date)
  DO UPDATE SET
    views = public.ad_metrics.views + GREATEST(p_increment, 1),
    updated_at = now(),
    client_mac = COALESCE(p_client_mac, public.ad_metrics.client_mac),
    ap_mac = COALESCE(p_ap_mac, public.ad_metrics.ap_mac),
    client_ip = COALESCE(p_client_ip, public.ad_metrics.client_ip);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_ad_metric(text, text, date, integer, text, text, text)
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

