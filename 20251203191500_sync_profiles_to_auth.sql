/*
  # Keep auth users metadata in sync with profiles

  Whenever a profile is inserted or updated, mirror key fields into auth.users.raw_user_meta_data
  so Avatar uploads (and full names) stay consistent across Supabase dashboards and JWT claims.
*/

CREATE OR REPLACE FUNCTION public.sync_profile_to_auth_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
      'full_name', NEW.full_name,
      'avatar_url', NEW.avatar_url,
      'email', NEW.email
    )
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profiles_sync_auth ON public.profiles;

CREATE TRIGGER on_profiles_sync_auth
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_auth_users();
