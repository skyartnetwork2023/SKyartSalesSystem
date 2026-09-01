import { supabase } from './supabase';

export interface UpsertForecastPayload {
  userId: string;
  year: number;
  value: number;
  method: string;
  note?: string;
  source?: string;
}

export interface ForecastRecord {
  id: string;
  user_id: string;
  year: number;
  value: number;
  method: string;
  note: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertForecast({
  userId,
  year,
  value,
  method,
  note,
  source = 'investment',
}: UpsertForecastPayload) {
  const { data, error } = await supabase
    .from('forecasts')
    .upsert(
      {
        user_id: userId,
        year,
        value,
        method,
        note: note ?? null,
        source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,year' }
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getForecastsByUser(userId: string) {
  const { data, error } = await supabase
    .from('forecasts')
    .select('*')
    .eq('user_id', userId)
    .order('year', { ascending: true });

  if (error) throw error;
  return data as ForecastRecord[];
}
