import { supabase } from './supabase';

export interface ProfileData {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
  settings: Record<string, unknown> | null;
}

export interface ProfileSummary {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, role, settings')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as ProfileData;
}

export async function updateProfile(
  userId: string,
  updates: Partial<Pick<ProfileData, 'full_name' | 'avatar_url'>>
) {
  const { error, data } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, email, full_name, avatar_url, role, settings')
    .single();

  if (error) throw error;
  return data as ProfileData;
}

export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('full_name', { ascending: true })
    .order('email', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProfileSummary[];
}

export async function updateUserRole(userId: string, role: 'user' | 'supervisor') {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, email, full_name, role')
    .single();

  if (error) throw error;
  return data as ProfileSummary;
}

export async function uploadAvatar(file: File, userId: string) {
  const extension = file.name.split('.').pop() || 'png';
  const path = `${userId}/avatar.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, {
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path);

  return { publicUrl, path };
}

export async function updateProfileSettings(userId: string, settings: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('id, email, full_name, avatar_url, role, settings')
    .single();

  if (error) throw error;
  return data as ProfileData;
}
