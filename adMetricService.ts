import { supabase } from './supabase';

const VIEW_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatDateKey = (date: Date) => {
  const iso = date.toISOString();
  return iso.slice(0, 10);
};

export type AdImpressionPayload = {
  bucketId: string;
  assetName: string;
  viewDate?: string;
  increment?: number;
};

export async function recordAdImpression(payload: AdImpressionPayload) {
  const { bucketId, assetName } = payload;
  if (!bucketId || !assetName) {
    return { error: new Error('Missing bucketId or assetName') };
  }
  const viewDate = payload.viewDate ?? formatDateKey(new Date());
  const increment = payload.increment ?? 1;
  const { error } = await supabase.rpc('increment_ad_metric', {
    p_bucket_id: bucketId,
    p_asset_name: assetName,
    p_view_date: viewDate,
    p_increment: increment,
  });
  return { error: error ?? null };
}
