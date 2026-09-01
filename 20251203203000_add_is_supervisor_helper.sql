/*
  # Replace recursive supervisor policies

  Adds a helper function `public.is_supervisor(uuid)` so RLS policies no longer self-reference
  the `profiles` table (which was causing infinite recursion) and recreates the supervisor
  policies to use that helper.
*/

CREATE OR REPLACE FUNCTION public.is_supervisor(target_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = COALESCE(target_id, auth.uid())
      AND role = 'supervisor'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_supervisor(uuid) TO authenticated;

-- Recreate supervisor policies to use the helper function
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Supervisors can view all profiles'
      AND tablename = 'profiles'
  ) THEN
    DROP POLICY "Supervisors can view all profiles" ON profiles;
  END IF;

  CREATE POLICY "Supervisors can view all profiles"
    ON profiles FOR SELECT
    TO authenticated
    USING (public.is_supervisor());

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Supervisors can manage profiles'
      AND tablename = 'profiles'
  ) THEN
    DROP POLICY "Supervisors can manage profiles" ON profiles;
  END IF;

  CREATE POLICY "Supervisors can manage profiles"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id OR public.is_supervisor())
    WITH CHECK (auth.uid() = id OR public.is_supervisor());

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Supervisors can view all vouchers'
      AND tablename = 'vouchers'
  ) THEN
    DROP POLICY "Supervisors can view all vouchers" ON vouchers;
  END IF;

  CREATE POLICY "Supervisors can view all vouchers"
    ON vouchers FOR SELECT
    TO authenticated
    USING (public.is_supervisor());
END $$;
