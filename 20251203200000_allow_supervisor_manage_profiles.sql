/*
  # Supervisors can edit user profiles

  Grants supervisors the ability to update any profile row (needed for role changes via the dashboard UI).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE policyname = 'Supervisors can manage profiles'
      AND tablename = 'profiles'
  ) THEN
    CREATE POLICY "Supervisors can manage profiles"
      ON profiles FOR UPDATE
      TO authenticated
      USING (
        auth.uid() = id OR EXISTS (
          SELECT 1 FROM profiles AS supervisor
          WHERE supervisor.id = auth.uid()
            AND supervisor.role = 'supervisor'
        )
      )
      WITH CHECK (
        auth.uid() = id OR EXISTS (
          SELECT 1 FROM profiles AS supervisor
          WHERE supervisor.id = auth.uid()
            AND supervisor.role = 'supervisor'
        )
      );
  END IF;
END $$;
