/*
  # Backfill historical profiles

  Inserts a profile row for every auth user that predates the automatic trigger.
*/

INSERT INTO public.profiles (id, email, full_name, avatar_url, role, created_at, updated_at)
SELECT
  u.id,
  u.email,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1), u.email) AS full_name,
  NULL AS avatar_url,
  'user' AS role,
  NOW(),
  NOW()
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE p.id IS NULL;
