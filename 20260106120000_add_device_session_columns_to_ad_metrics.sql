/*
  # Add device/session columns to ad_metrics
  Adds columns for client_mac, ap_mac, and client_ip to support device/session tracking.
*/

ALTER TABLE ad_metrics
  ADD COLUMN client_mac text,
  ADD COLUMN ap_mac text,
  ADD COLUMN client_ip text;

-- Optionally, add an index for session tracking
CREATE INDEX idx_ad_metrics_client_mac ON ad_metrics(client_mac);
CREATE INDEX idx_ad_metrics_ap_mac ON ad_metrics(ap_mac);
CREATE INDEX idx_ad_metrics_client_ip ON ad_metrics(client_ip);